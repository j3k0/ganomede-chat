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
        expect(room).to.have.property('messageList')
        done()

    it 'sets room expiry upon creation', (done) ->
      redisClient.pttl manager.key(roomId), (err, millis) ->
        expect(err).to.be(null)
        expect(millis).to.be.greaterThan(config.redis.ttlMillis - 200)
        done()

    describe 'returns error when', () ->
      testError = (spec, createArgument, expectedMessage) ->
        it spec, (done) ->
          manager.create createArgument, (err, room) ->
            expect(err).to.be.an(Error)
            expect(err.message).to.be(expectedMessage)
            done()

      testError('room already exists',
        roomInfo, RoomManager.errors.ROOM_EXISTS)

      testError('options.type is missing',
        {}, RoomManager.errors.INVALID_CREATION_OPTIONS)

      testError('options.type is empty string',
        {type: ''}, RoomManager.errors.INVALID_CREATION_OPTIONS)

      testError('options.users is missing',
        {type: service}, RoomManager.errors.INVALID_CREATION_OPTIONS)

      testError('options.users is not an array',
        {type: service, users: {}}, RoomManager.errors.INVALID_CREATION_OPTIONS)

      testError('options.users is empty',
        {type: service, users: []}, RoomManager.errors.INVALID_CREATION_OPTIONS)

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

    describe '.id()', () ->
      it 'room id is prefixed with type', () ->
        expect(RoomManager.Room.id(roomInfo).indexOf(service)).to.be(0)

      it 'room id ends with sorted list of user', () ->
        users = ['x', 'a', '01', 'z']
        actual = RoomManager.Room.id({
          type: service,
          users: users
        })

        expect(actual).to.be("#{service}/#{users.sort().join('/')}")

    describe '#hasUser()', () ->
      it 'returns true if username is participant', () ->
        expect(room.hasUser('alice')).to.be(true)
        expect(room.hasUser('bob')).to.be(true)

      it 'returns false otherwise', () ->
        expect(room.hasUser('joe')).to.be(false)
        expect(room.hasUser({})).to.be(false)

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
