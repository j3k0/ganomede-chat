import fakeredis from 'fakeredis';
import expect from 'expect.js';
import RoomManager, { Room } from '../src/room-manager';
import config from '../src/config';
import { RedisClient } from 'redis';
fakeredis.fast = true;

describe('RoomManager', function () {
  const redisClient = fakeredis.createClient() as RedisClient;

  const prefix = 'ganomede:test:room-manager';

  const manager = new RoomManager({
    redis: redisClient,
    prefix,
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  });

  const service = 'game/v1';
  const roomId = `${service}/alice/bob`;
  const roomInfo = {
    type: service,
    users: ['alice', 'bob']
  };
  const roomExpected = new Room(roomInfo);
  const message = {
    timestamp: Date.now(),
    from: 'alice',
    type: 'text',
    message: 'hello'
  };

  after(done => redisClient.keys(`${prefix}:*`, function (err, keys) {
    if (err) {
      return done(err);
    }

    if (!keys.length) {
      return done();
    }

    redisClient.del.apply(redisClient, (keys as any[]).concat(done));
  }));

  describe('redis key utilities', function () {
    it('#key() correctly generates redis keys', function () {
      expect(manager.key('key')).to.be(`${prefix}:key`);
      return expect(manager.key('key', 'subkey', 'a')).to.be(`${prefix}:key:subkey:a`);
    });

    return it('#messagesKey() appends `:messages` to room id', () => expect(manager.messagesKey('roomId')).to.be(`${prefix}:roomId:messages`));
  });

  describe('#create()', function () {
    it('creates new Room', done => manager.create(roomInfo, function (err, room) {
      expect(err).to.be(null);
      expect(room).to.eql(roomExpected);
      expect(room).to.have.property('messageList');
      return done();
    }));

    it('sets room expiry upon creation', done => redisClient.pttl(manager.key(roomId), function (err, millis) {
      expect(err).to.be(null);
      expect(millis).to.be.greaterThan(config.redis.ttlMillis - 200);
      return done();
    }));

    return describe('returns error when', function () {
      const testError = (spec, createArgument, expectedMessage) => it(spec, done => manager.create(createArgument, function (err, room) {
        expect(err).to.be.an(Error);
        expect(err.message).to.be(expectedMessage);
        return done();
      }));

      testError('room already exists',
        roomInfo, RoomManager.errors.ROOM_EXISTS);

      testError('options.type is missing',
        {}, RoomManager.errors.INVALID_CREATION_OPTIONS);

      testError('options.type is empty string',
        { type: '' }, RoomManager.errors.INVALID_CREATION_OPTIONS);

      testError('options.users is missing',
        { type: service }, RoomManager.errors.INVALID_CREATION_OPTIONS);

      testError('options.users is not an array',
        { type: service, users: {} }, RoomManager.errors.INVALID_CREATION_OPTIONS);

      return testError('options.users is empty',
        { type: service, users: [] }, RoomManager.errors.INVALID_CREATION_OPTIONS);
    });
  });

  describe('#findById()', function () {
    it('returns room by its id', done => manager.findById(roomId, function (err, room) {
      expect(err).to.be(null);
      expect(room).to.eql(roomExpected);
      return done();
    }));

    return it('returns null if room was not found', done => manager.findById('i-dont-exist', function (err, room) {
      expect(err).to.be(null);
      expect(room).to.be(null);
      return done();
    }));
  });

  describe('#refreshTtl()', () => it('updates room\'s ttl to #ttlMillis', done => manager.refreshTtl(roomId, function (err, status) {
    expect(err).to.be(null);
    expect(status).to.be(1);
    return done();
  })));

  return describe('Room', function () {
    let room: Room | undefined = undefined;
    before(done => manager.findById(roomId, function (err, room_) {
      if (err) {
        return done(err);
      }

      room = room_;
      return done();
    }));

    describe('.id()', function () {
      it('room id is prefixed with type', () => expect(Room.id(roomInfo).indexOf(service)).to.be(0));

      return it('room id ends with sorted list of user', function () {
        const users = ['x', 'a', '01', 'z'];
        const actual = Room.id({
          type: service,
          users
        });

        return expect(actual).to.be(`${service}/${users.sort().join('/')}`);
      });
    });

    describe('#hasUser()', function () {
      it('returns true if username is participant', function () {
        expect(room?.hasUser('alice')).to.be(true);
        expect(room?.hasUser('bob')).to.be(true);
      });

      it('returns false otherwise', function () {
        expect(room?.hasUser('joe')).to.be(false);
        expect(room?.hasUser({})).to.be(false);
      });
    });

    describe('#addMessage()', () => it('adds a message to a room', done => room?.addMessage(message, function (err) {
      expect(err).to.be(null);

      redisClient.lrange(manager.messagesKey(roomId), 0, -1,
        function (err, messages) {
          expect(err).to.be(null);
          expect(messages).to.have.length(1);
          expect(JSON.parse(messages[0])).to.eql(message);
          done();
        });
    })));

    describe('#messages()', () => it('retrieves Room\'s messages for given room', done => room?.messages(function (err, messages) {
      expect(err).to.be(null);
      expect(messages).to.eql([message]);
      done();
    })));
  });
});
