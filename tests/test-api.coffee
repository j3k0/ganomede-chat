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
    path = (roomId, username) ->
      token = samples.users[username]?.token
      if username == process.env.API_SECRET
        token = process.env.API_SECRET

      return endpoint("/rooms/#{encodeURIComponent(roomId)}", token)

    it 'returns room info with a list of messages', (done) ->
      go()
        .get(path(samples.rooms[0].id, 'alice'))
        .expect(200)
        .end (err, res) ->
          expect(err).to.be(null)
          expect(res.body).to.eql(lodash.extend({
            messages: lodash(samples.messages[0]).reverse().value()
          }, samples.rooms[0]))
          done()

    it 'allows access with :authToken being API_SECRET', (done) ->
      go()
        .get(path(samples.rooms[0].id, process.env.API_SECRET))
        .expect(200, done)

    it '404 when room is not found', (done) ->
      go()
        .get(path('non-existent-room', 'alice'))
        .expect(404, done)

    it '401 when user is not in the room', (done) ->
      go()
        .get(path(samples.rooms[1].id, 'alice'))
        .expect(401, done)

    it '401 on invalid auth tokens', (done) ->
      go()
        .get(path('does-not-matter'))
        .expect(401, done)
