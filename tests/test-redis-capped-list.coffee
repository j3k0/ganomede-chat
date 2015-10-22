redis = require 'redis'
expect =  require 'expect.js'
RedisCappedList = require '../src/redis-capped-list'
config = require '../config'

describe 'RdisCappedList', () ->
  redisClient = redis.createClient({
    host: config.redis.host
    port: config.redis.port
  })

  id = (key) ->
    return "ganomede:test:redis-capped-list:#{key}"

  instance = (options={}) ->
    options.redis = options.redis || redisClient
    options.maxSize = options.maxSize || 3

    return new RedisCappedList(options)

  item = (idx) ->
    return {item: idx}

  describe '#items()', () ->
    itemsInserted = [1, 2, 3, 4, 5, 6, 7].map(item)
    redisKey = id('#items()')

    before (done) ->
      jsons = itemsInserted.map (item) -> JSON.stringify(item)
      args = [redisKey].concat(jsons).concat(done)
      redisClient.rpush.apply(redisClient, args)

    after (done) ->
      redisClient.del(redisKey, done)

    it 'returns items in the list', (done) ->
      list = instance({id: redisKey})
      list.items (err, items) ->
        expect(err).to.be(null)
        expect(items).to.eql(itemsInserted)
        done()

    it 'returns empty array if there are no items or key', (done) ->
      list = instance({id: 'w/ever'})
      list.items (err, items) ->
        expect(err).to.be(null)
        expect(items).to.eql([])
        done()

  describe '#add()', () ->
    redisKey = id('#add()')
    list = instance({id: redisKey, maxSize: 2})

    after (done) ->
      redisClient.del(redisKey, done)

    it 'adds element to the list', (done) ->
      list.add item(1), (err, newSize) ->
        expect(err).to.be(null)
        expect(newSize).to.be(1)
        done()

    it 'element is added to the beginning', (done) ->
      list.add item(2), (err, newSize) ->
        expect(err).to.be(null)
        expect(newSize).to.be(2)

        redisClient.lrange redisKey, 0, -1, (err, items) ->
          expect(err).to.be(null)
          expect(JSON.parse(items[0])).to.eql(item(2))
          done()

    it 'if list is too big, removes 1 element from the tail (oldest)', (done) ->
      list.add item(3), (err, newSize) ->
        expect(err).to.be(null)
        expect(newSize).to.be(2)

        redisClient.lrange redisKey, 0, -1, (err, items) ->
          expect(err).to.be(null)
          expect(items.map(JSON.parse.bind(JSON))).to.eql([3, 2].map(item))
          done()
