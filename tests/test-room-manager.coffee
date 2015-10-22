redis = require 'redis'
expect = require 'expect.js'
RoomManager = require '../src/room-manager'
config = require '../config'

describe 'RoomManager', () ->
  redisClient = redis.createClient({
    host: config.redis.host,
    port: config.redis.port
  })

  prefix = 'ganomede:test:room-manager'

  manager = new RoomManager({
    redis: redisClient,
    prefix: prefix,
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  })

  service = 'game/v1'
  roomId = "#{service}/alice/bob"
  roomInfo = {
    type: service
    users: ['alice', 'bob']
  }
  roomExpected = new RoomManager.Room(roomInfo)
  message = {
    timestamp: Date.now(),
    from: 'alice',
    type: 'text',
    message: 'hello'
  }

  after (done) ->
    redisClient.keys "#{prefix}:*", (err, keys) ->
      if (err)
        return done(err)

      unless keys.length
        return done()

      redisClient.del.apply(redisClient, keys.concat(done))

  describe 'redis key utilities', () ->
    it '#key() correctly generates redis keys', () ->
      expect(manager.key('key')).to.be("#{prefix}:key")
      expect(manager.key('key', 'subkey', 'a')).to.be("#{prefix}:key:subkey:a")

    it '#messagesKey() appends `:messages` to room id', () ->
      expect(manager.messagesKey('roomId')).to.be("#{prefix}:roomId:messages")

  describe '#create()', () ->
    it 'creates new Room', (done) ->
      manager.create roomInfo, (err, room) ->
        expect(err).to.be(null)
        expect(room).to.eql(roomExpected)
        done()

    it 'sets room expiry upon creation', (done) ->
      redisClient.pttl manager.key(roomId), (err, millis) ->
        expect(err).to.be(null)
        expect(millis).to.be.greaterThan(config.redis.ttlMillis - 50)
        done()

    it 'returns error if room already exists', (done) ->
      manager.create roomInfo, (err, room) ->
        expect(err).to.be.an(Error)
        expect(err.message).to.be(RoomManager.errors.ROOM_EXISTS)
        done()

  describe '#findById()', () ->
    it 'returns room by its id', (done) ->
      manager.findById roomId, (err, room) ->
        expect(err).to.be(null)
        expect(room).to.eql(roomExpected)
        done()

    it 'returns null if room was not found', (done) ->
      manager.findById 'i-dont-exist', (err, room) ->
        expect(err).to.be(null)
        expect(room).to.be(null)
        done()

  describe '#refreshTtl()', () ->
    it 'updates room\'s ttl to #ttlMillis', (done) ->
      manager.refreshTtl roomId, (err, status) ->
        expect(err).to.be(null)
        expect(status).to.be(1)
        done()

  describe 'Room', () ->
    room = undefined
    before (done) ->
      manager.findById roomId, (err, room_) ->
        if (err)
          return done(err)

        room = room_
        done()

    describe '#addMessage()', () ->
      it 'adds a message to a room', (done) ->
        room.addMessage message, (err) ->
          expect(err).to.be(null)

          redisClient.lrange manager.messagesKey(roomId), 0, -1,
          (err, messages) ->
            expect(err).to.be(null)
            expect(messages).to.have.length(1)
            expect(JSON.parse(messages[0])).to.eql(message)
            done()

    describe '#messages()', () ->
      it 'retrieves Room\'s messages for given room', (done) ->
        room.messages (err, messages) ->
          expect(err).to.be(null)
          expect(messages).to.eql([message])
          done()
