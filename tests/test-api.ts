/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS203: Remove `|| {}` from converted for-own loops
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import async from 'async';
import lodash from 'lodash';
import sinon from 'sinon';
import supertest from 'supertest';
import expect from 'expect.js';
import RoomManager from '../src/room-manager';
import api from '../src/api';
import config from '../src/config';
import samples from './samples';
import fakeAuthdb from './fake-authdb';
import fakeBansClient from './fake-bans-client';
import restify from 'restify';
import fakeredis from 'fakeredis';
fakeredis.fast = true;

describe('Chat API', function () {
  const server = restify.createServer();
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser());
  server.use(restify.plugins.gzipResponse())
  const go = supertest.bind(null, server);
  const prefix = `testing:${config.redis.prefix}`;

  const authDb = fakeAuthdb.createClient();

  const redisClient = fakeredis.createClient();

  const roomManager = new RoomManager({
    redis: redisClient,
    prefix: `testing:${config.redis.prefix}`,
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  });

  const bansClient = fakeBansClient();

  const endpoint = function (path: string | null, token: string | null): string {
    if (path == null) { path = '/'; }
    if (token == null) { token = 'invalid-token'; }
    return `/${config.routePrefix}/auth/${token}${path}`;
  };

  const roomsEndpoint = function (username: string, roomId?: string): string {
    let token = samples.users[username] != null ? samples.users[username].token : undefined;
    if (username === process.env.API_SECRET) {
      token = process.env.API_SECRET;
    }

    const room = roomId ? `/${encodeURIComponent(roomId)}` : '';
    return endpoint(`/rooms${room}`, token);
  };

  const messagesEndpoint = (username, roomId) => roomsEndpoint(username, roomId) + '/messages';

  const systemMessagesEndpoint = token => endpoint('/system-messages', token);

  roomManager.refreshTtl = sinon.spy(roomManager.refreshTtl);
  const spies = {
    refreshTtl: roomManager.refreshTtl,
    sendNotification: sinon.spy()
  } as {
    refreshTtl: any;
    sendNotification: any;
  };

  before(function (done) {
    //
    // Create users
    process.env.API_SECRET = 'api-secret';
    for (let username of Object.keys(samples.users || {})) {
      const account = samples.users[username];
      authDb.addAccount(account.token, account);
    }

    // Setup API
    const chatApi = api({
      roomManager,
      authDb,
      sendNotification: spies.sendNotification,
      bansClient
    });
    chatApi(config.routePrefix, server);

    // Create some rooms and messages
    const addRooms = samples.rooms.map((roomInfo, idx) => cb => roomManager.create(roomInfo, function (err, room) {
      if (err) {
        return cb(err);
      }

      const addMessages = samples.messages[idx].map(message => room.addMessage.bind(room, message));
      return async.series(addMessages, cb);
    }));

    return async.parallel(addRooms, done);
  });

  after(function (done) {
    redisClient.keys(`${prefix}:*`, function (err, keys) {
      if (err) {
        return done(err);
      }

      if (!keys.length) {
        return done();
      }

      const delArgs: any[] = (keys as any).concat(done);
      redisClient.del.apply(redisClient, delArgs);
    })
  });

  describe('GET /<auth>/rooms/:roomId', function () {
    it('returns room info with a list of messages', done => go()
      .get(roomsEndpoint('alice', samples.rooms[0].id))
      .expect(200)
      .end(function (err, res) {
        expect(err).to.be(null);
        expect(res.body).to.eql(lodash.extend({
          messages: lodash(
            lodash.clone(samples.messages[0])
          ).reverse().value()
        }, samples.rooms[0]));
        return done();
      }));

    it('allows access with :authToken being API_SECRET', done => go()
      .get(roomsEndpoint(process.env.API_SECRET || '', samples.rooms[0].id))
      .expect(200, done));

    it('404 when room is not found', done => go()
      .get(roomsEndpoint('alice', 'non-existent-room'))
      .expect(404, done));

    it('401 when user is not in the room', done => go()
      .get(roomsEndpoint('alice', samples.rooms[1].id))
      .expect(401, done));

    return it('401 on invalid auth tokens', done => go()
      .get(roomsEndpoint('no-username-hence-no-token', 'does-not-mater'))
      .expect(401, done));
  });

  describe('POST /<auth>/rooms', function () {
    it('creates new room', done => go()
      .post(roomsEndpoint('alice'))
      .send({ type: 'game/v1', users: ['alice', 'friendly-potato'] })
      .expect(200, {
        id: 'game/v1/alice/friendly-potato',
        type: 'game/v1',
        users: ['alice', 'friendly-potato'],
        messages: [],
      }, done));

    it('sends room info, if it already exists', done => // Calls .refreshTtl() on room[0]
      go()
        .post(roomsEndpoint('bob'))
        .send(samples.rooms[0])
        .expect(200, lodash.extend({
          messages: lodash(lodash.clone(samples.messages[0])).reverse().value()
        }, samples.rooms[0]), done));

    it('refreshes ttl of existing rooms', function () {
      expect(spies.refreshTtl.callCount).to.be(1);
      return expect(spies.refreshTtl.getCall(0).args[0]).to.be(samples.rooms[0].id);
    });

    it('allows access with :authToken being API_SECRET', done => // Calls .refreshTtl() on room[1]
      go()
        .post(roomsEndpoint(process.env.API_SECRET || ''))
        .send({ type: 'game/v1', users: ['alice', 'friendly-potato'] })
        .expect(200, done));

    it('401 on invalid auth tokens', done => go()
      .post(roomsEndpoint('no-username-hence-no-token'))
      .send({ type: 'game/v1', users: ['alice', 'friendly-potato'] })
      .expect(401, done));

    it('401 if user not part of the room', done => go()
      .post(roomsEndpoint('harry'))
      .send(samples.rooms[0])
      .expect(401, done));

    return it('403 if user is banned', done => go()
      .post(roomsEndpoint('banned-joe'))
      .send(samples.rooms[0])
      .expect(403)
      .end(function (err) {
        expect(err).to.be(null);
        expect(bansClient._callArgs[bansClient._callArgs.length - 1])
          .to.be('banned-joe');
        expect(bansClient._results).to.have.property('banned-joe', true);
        return done();
      }));
  });

  const messageChecker = function (message, redisKey) {
    const expectedJson = sender => lodash.extend({ from: sender }, message);

    return (sender, cb) => redisClient.lindex(redisKey, 0, function (err, json) {
      expect(err).to.be(null);
      expect(JSON.parse(json)).to.eql(expectedJson(sender));
      return cb();
    });
  };

  describe('POST /system-messages', function () {
    const message = {
      type: 'event',
      timestamp: Date.now(),
      message: 'system_message'
    };
    const payload = lodash.extend({}, message, {
      type: 'game/v1',
      users: ['alice', 'bob']
    }
    );
    const roomId = samples.rooms[0].id;
    const redisKey = `${prefix}:${roomId}:messages`;

    const checkMessage = messageChecker(message, redisKey);

    it('adds message to a room', done => go()
      .post(systemMessagesEndpoint(process.env.API_SECRET))
      .send(payload)
      .expect(200)
      .end(function (err, res) {
        expect(err).to.be(null);
        return checkMessage('$$', done);
      }));

    it('refreshes room\'s ttl', function () {
      expect(spies.refreshTtl.callCount).to.be(4);
      return expect(spies.refreshTtl.getCall(3).args[0]).to.be(samples.rooms[0].id);
    });

    return it('calls sendNotification() for everyone in the room', function () {
      expect(spies.sendNotification.callCount).to.be(2);
      const expectCall = function (index, username) {
        const callArgs = spies.sendNotification.getCall(index).args;
        const notification = callArgs[0];
        expect(notification.to).to.be(username);
        return expect(notification.data).to.eql(lodash.extend({
          roomId: samples.rooms[0].id,
          from: '$$'
        }, message));
      };
      expectCall(0, 'alice');
      return expectCall(1, 'bob');
    });
  });

  return describe('POST /<auth>/rooms/:roomId/messages', function () {
    const message = {
      timestamp: Date.now(),
      type: 'text',
      message: 'Newest message'
    };

    const roomId = samples.rooms[0].id;
    const redisKey = `${prefix}:${roomId}:messages`;

    const checkMessage = messageChecker(message, redisKey);

    it('adds message to a room', done => // Calls .refreshTtl() on room[0]
      go()
        .post(messagesEndpoint('alice', roomId))
        .send(message)
        .expect(200)
        .end(function (err, res) {
          expect(err).to.be(null);
          return checkMessage('alice', done);
        }));

    it('refreshes room\'s ttl', function () {
      expect(spies.refreshTtl.callCount).to.be(5);
      return expect(spies.refreshTtl.getCall(4).args[0]).to.be(samples.rooms[0].id);
    });

    it('calls sendNotification() for everyone in the room but sender', done => go()
      .post(messagesEndpoint('alice', roomId))
      .send(message)
      .end(function (err, res) {
        expect(spies.sendNotification.callCount).to.be(4);
        const callArgs = spies.sendNotification.getCall(3).args;
        const notification = callArgs[0];
        expect(notification.to).to.be('bob');
        expect(notification.data).to.eql(lodash.extend({
          roomId: samples.rooms[0].id,
          from: 'alice'
        }, message));
        return done();
      }));

    it('allows access with :authToken being API_SECRET', done => go()
      .post(messagesEndpoint(process.env.API_SECRET, roomId))
      .send(message)
      .expect(200)
      .end(function (err, res) {
        expect(err).to.be(null);
        return checkMessage('$$', done);
      }));

    it('401 when user is not in the room', done => go()
      .post(messagesEndpoint('alice', samples.rooms[1].id))
      .expect(401, done));

    it('401 on invalid auth tokens', done => go()
      .post(messagesEndpoint('no-username-hence-no-token', roomId))
      .expect(401, done));

    it('404 when room is not found', done => go()
      .post(messagesEndpoint('alice', 'non-existent-room'))
      .expect(404, done));

    return it('403 when user is banned', done => go()
      .post(messagesEndpoint('banned-joe', roomId))
      .expect(403)
      .end(function (err) {
        expect(err).to.be(null);
        expect(bansClient._callArgs[bansClient._callArgs.length - 1])
          .to.be('banned-joe');
        expect(bansClient._results).to.have.property('banned-joe', true);
        return done();
      }));
  });
});
