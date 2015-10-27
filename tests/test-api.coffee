async = require 'async'
redis = require 'redis'
lodash = require 'lodash'
supertest = require 'supertest'
expect = require 'expect.js'
helpers = require 'ganomede-helpers'
RoomManager = require '../src/room-manager'
api = require '../src/api'
config = require '../config'
samples = require './samples'
fakeAuthdb = require './fake-authdb'

describe 'Chat API', () ->
  server = helpers.restify.createServer()
  go = supertest.bind(null, server)
  prefix = "testing:#{config.redis.prefix}"

  authDb = fakeAuthdb.createClient()

  redisClient = redis.createClient({
    host: config.redis.host
    port: config.redis.por
  })

  roomManager = new RoomManager({
    redis: redisClient,
    prefix: "testing:#{config.redis.prefix}",
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  })

  endpoint = (path='/', token='invalid-token') ->
    return "/#{config.routePrefix}/auth/#{token}#{path}"

  roomsEndpoint = (username, roomId) ->
    token = samples.users[username]?.token
    if username == process.env.API_SECRET
      token = process.env.API_SECRET

    room = if roomId then "/#{encodeURIComponent(roomId)}" else ''
    return endpoint("/rooms#{room}", token)

  messagesEndpoint = (username, roomId) ->
    return roomsEndpoint(username, roomId) + '/messages'

  before (done) ->
    # Create users
    process.env.API_SECRET = 'api-secret'
    for own username, account of samples.users
      authDb.addAccount(account.token, account)

    # Create some rooms and messages
    addRooms = samples.rooms.map (roomInfo, idx) ->
      return (cb) ->
        roomManager.create roomInfo, (err, room) ->
          if (err)
            return cb(err)

          addMessages = samples.messages[idx].map (message) ->
            return room.addMessage.bind(room, message)
          async.series(addMessages, cb)

    async.parallel(addRooms, done)

    # Setup API
    chatApi = api({roomManager, authDb})
    chatApi(config.routePrefix, server)

  after (done) ->
    redisClient.keys "#{prefix}:*", (err, keys) ->
      if (err)
        return done(err)

      unless keys.length
        return done()

      redisClient.del.apply(redisClient, keys.concat(done))

  describe 'GET /<auth>/rooms/:roomId', () ->
    it 'returns room info with a list of messages', (done) ->
      go()
        .get(roomsEndpoint('alice', samples.rooms[0].id))
        .expect(200)
        .end (err, res) ->
          expect(err).to.be(null)
          expect(res.body).to.eql(lodash.extend({
            messages: lodash(
              lodash.clone(samples.messages[0])
            ).reverse().value()
          }, samples.rooms[0]))
          done()

    it 'allows access with :authToken being API_SECRET', (done) ->
      go()
        .get(roomsEndpoint(process.env.API_SECRET, samples.rooms[0].id))
        .expect(200, done)

    it '404 when room is not found', (done) ->
      go()
        .get(roomsEndpoint('alice', 'non-existent-room'))
        .expect(404, done)

    it '401 when user is not in the room', (done) ->
      go()
        .get(roomsEndpoint('alice', samples.rooms[1].id))
        .expect(401, done)

    it '401 on invalid auth tokens', (done) ->
      go()
        .get(roomsEndpoint('no-username-hence-no-token', 'does-not-mater'))
        .expect(401, done)

  describe 'POST /<auth>/rooms', () ->
    it 'creates new room', (done) ->
      go()
        .post(roomsEndpoint('alice'))
        .send({type: 'game/v1', users: ['alice', 'friendly-potato']})
        .expect(200, {
          id: 'game/v1/alice/friendly-potato'
          type: 'game/v1',
          users: [ 'alice', 'friendly-potato' ],
          messages: [],
        }, done)

    it 'sends room info, if it already exists', (done) ->
      go()
        .post(roomsEndpoint('bob'))
        .send(samples.rooms[0])
        .expect(200, lodash.extend({
          messages: lodash(lodash.clone(samples.messages[0])).reverse().value()
        }, samples.rooms[0]), done)

    it 'allows access with :authToken being API_SECRET', (done) ->
      go()
        .post(roomsEndpoint(process.env.API_SECRET))
        .send({type: 'game/v1', users: ['alice', 'friendly-potato']})
        .expect(200, done)

    it '401 on invalid auth tokens', (done) ->
      go()
        .post(roomsEndpoint('no-username-hence-no-token'))
        .send({type: 'game/v1', users: ['alice', 'friendly-potato']})
        .expect(401, done)

  describe 'POST /<auth>/rooms/:roomId/messages', () ->
    message =
      timestamp: Date.now()
      type: 'text'
      message: 'Newest message'

    roomId = samples.rooms[0].id
    redisKey = "#{prefix}:#{roomId}:messages"

    expectedJson = (sender) ->
      return lodash.extend({from: sender}, message)

    checkMessage = (sender, cb) ->
      expected = lodash.extend({from: sender}, message)
      redisClient.lindex redisKey, 0, (err, json) ->
        expect(err).to.be(null)
        expect(JSON.parse(json)).to.eql(expectedJson(sender))
        cb()

    it 'adds message to a room', (done) ->
      go()
        .post(messagesEndpoint('alice', roomId))
        .send(message)
        .expect(200)
        .end (err, res) ->
          expect(err).to.be(null)
          checkMessage('alice', done)

    it 'allows access with :authToken being API_SECRET', (done) ->
      go()
        .post(messagesEndpoint(process.env.API_SECRET, roomId))
        .send(message)
        .expect(200)
        .end (err, res) ->
          expect(err).to.be(null)
          checkMessage('$$', done)

    it '401 when user is not in the room', (done) ->
      go()
        .post(messagesEndpoint('alice', samples.rooms[1].id))
        .expect(401, done)

    it '401 on invalid auth tokens', (done) ->
      go()
        .post(messagesEndpoint('no-username-hence-no-token', roomId))
        .expect(401, done)

    it '404 when room is not found', (done) ->
      go()
        .post(messagesEndpoint('alice', 'non-existent-room'))
        .expect(404, done)
