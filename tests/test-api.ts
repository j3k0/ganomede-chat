import async from 'async';
import lodash from 'lodash';
import sinon from 'sinon';
import supertest from 'supertest';
import expect from 'expect.js';
import RoomManager from '../src/room-manager';
import api from '../src/api';
import config from '../src/config';
import samples from './samples';
import fakeAuthdb, { AuthdbClient } from './fake-authdb';
import policies, { PoliciesClient } from '../src/policies';
import restify, { Server } from 'restify';
import fakeredis from 'fakeredis';
import { RedisClient } from 'redis';
fakeredis.fast = true;

interface Test {
  server: Server;
  go: any;
  prefix: string;
  authDb: AuthdbClient;
  redisClient: RedisClient;
  roomManager: RoomManager;
  redisUsermeta: RedisClient;
  policiesClient: PoliciesClient;
  spies: {
    refreshTtl: any;
    sendNotification: any;
  };
}

function createTest(): Test {
  const test: Partial<Test> = {};
  test.server = restify.createServer();
  test.server.use(restify.plugins.queryParser());
  test.server.use(restify.plugins.bodyParser());
  test.server.use(restify.plugins.gzipResponse())
  test.go = supertest.bind(null, test.server);
  test.prefix = `testing:${config.redis.prefix}`;

  test.authDb = fakeAuthdb.createClient();

  test.redisClient = fakeredis.createClient();
  test.redisUsermeta = fakeredis.createClient();

  Object.keys(samples.users).forEach((user) => {
    const item = samples.users[user];
    test.redisUsermeta?.set(`${item.username}:email`, item.email);
    test.redisUsermeta?.set(`${item.username}:ConfirmedOn`, JSON.stringify(item.ConfirmedOn));
  });

  test.roomManager = new RoomManager({
    redis: test.redisClient!,
    prefix: `testing:${config.redis.prefix}`,
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  });

  test.policiesClient = policies.createClient(test.redisUsermeta);
  
  test.roomManager.refreshTtl = sinon.spy(test.roomManager.refreshTtl);
  test.spies = {
    refreshTtl: test.roomManager.refreshTtl,
    sendNotification: sinon.spy()
  };

  return test as Test;
}

describe('Chat API', function () {

  let test: Test = createTest();

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

  beforeEach(function (done) {
    test = createTest();

    // Create users
    process.env.API_SECRET = 'api-secret';
    for (let username of Object.keys(samples.users || {})) {
      const account = samples.users[username];
      test.authDb.addAccount(account.token, account);
    }

    // Setup API
    const chatApi = api({
      roomManager: test.roomManager,
      authDb: test.authDb,
      sendNotification: test.spies.sendNotification,
      policiesClient: test.policiesClient
    });
    chatApi(config.routePrefix, test.server);

    // Create some rooms and messages
    const addRooms = samples.rooms.map((roomInfo, idx) => cb => test.roomManager.create(roomInfo, function (err, room) {
      if (err) {
        return cb(err);
      }

      const addMessages = samples.messages[idx].map(message => room.addMessage.bind(room, message));
      return async.series(addMessages, cb);
    }));

    return async.parallel(addRooms, done);
  });

  // after(function (done) {
  //   redisClient.keys(`${prefix}:*`, function (err, keys) {
  //     if (err) {
  //       return done(err);
  //     }

  //     if (!keys.length) {
  //       return done();
  //     }

  //     const delArgs: any[] = (keys as any).concat(done);
  //     redisClient.del.apply(redisClient, delArgs);
  //   })
  // });

  describe('GET /<auth>/rooms/:roomId', function () {
    it('returns room info with a list of messages', done => test.go()
      .get(roomsEndpoint('alice', samples.rooms[0].id))
      .expect(200)
      .end(function (err, res) {
        expect(err).to.be(null);
        expect(res.body).to.eql(lodash.extend({
          messages: lodash(
            lodash.clone(samples.messages[0])
          ).reverse().value()
        }, samples.rooms[0]));
        done();
      }));

    it('allows access with :authToken being API_SECRET', done => test.go()
      .get(roomsEndpoint(process.env.API_SECRET || '', samples.rooms[0].id))
      .expect(200, done));

    it('404 when room is not found', done => test.go()
      .get(roomsEndpoint('alice', 'non-existent-room'))
      .expect(404, done));

    it('401 when user is not in the room', done => test.go()
      .get(roomsEndpoint('alice', samples.rooms[1].id))
      .expect(401, done));

    it('401 on invalid auth tokens', done => test.go()
      .get(roomsEndpoint('no-username-hence-no-token', 'does-not-mater'))
      .expect(401, done));
  });

  describe('POST /<auth>/rooms', function () {
    // before(function() {
    //   spies.sendNotification = sinon.spy();
    //   spies.refreshTtl = roomManager.refreshTtl = sinon.spy(saveRefreshTtl);
    // });  
  
    it('creates new room', done => test.go()
      .post(roomsEndpoint('alice'))
      .send({ type: 'game/v1', users: ['alice', 'friendly-potato'] })
      .expect(200, {
        id: 'game/v1/alice/friendly-potato',
        type: 'game/v1',
        users: ['alice', 'friendly-potato'],
        messages: [],
      }, done));

    it('sends room info, if it already exists', done => // Calls .refreshTtl() on room[0]
      test.go()
        .post(roomsEndpoint('bob'))
        .send(samples.rooms[0])
        .expect(200, lodash.extend({
          messages: lodash(lodash.clone(samples.messages[0])).reverse().value()
        }, samples.rooms[0]), function () {
          // refreshes ttl of existing rooms
          expect(test.spies.refreshTtl.callCount).to.be(1);
          expect(test.spies.refreshTtl.getCall(0).args[0]).to.be(samples.rooms[0].id);
          done();
        }));

    it('allows access with :authToken being API_SECRET', done => // Calls .refreshTtl() on room[1]
      test.go()
        .post(roomsEndpoint(process.env.API_SECRET || ''))
        .send({ type: 'game/v1', users: ['alice', 'friendly-potato'] })
        .expect(200, done));

    it('401 on invalid auth tokens', done => test.go()
      .post(roomsEndpoint('no-username-hence-no-token'))
      .send({ type: 'game/v1', users: ['alice', 'friendly-potato'] })
      .expect(401, done));

    it('401 if user not part of the room', done => test.go()
      .post(roomsEndpoint('harry'))
      .send(samples.rooms[0])
      .expect(401, done));

    it('403 if user is banned', done => {
      test.redisUsermeta.set('bob:$banned', '1');
      test.go()
        .post(roomsEndpoint('bob'))
        .send(samples.rooms[0])
        .expect(403)
        .end(function (err) {
          expect(err).to.be(null);
          done();
        });
    });

    it('403 if user doesnt have email', done => {
      test.go()
        .post(roomsEndpoint('tutoro'))
        .send(samples.rooms[0])
        .expect(403)
        .end(function (err, res) {
          expect(err).to.be(null);
          expect(res.body.message).to.be.eql('EMAIL_NOT_VERIFIED');
          done();
        });
    });

    it('403 if user is not confirmed', done => {
      test.go()
        .post(roomsEndpoint('tutoro2'))
        .send(samples.rooms[0])
        .expect(403)
        .end(function (err, res) {
          expect(err).to.be(null);
          expect(res.body.message).to.be.eql('EMAIL_NOT_VERIFIED');
          done();
        });
    });
    it('403 if user last email is not confirmed', done => {
      test.go()
        .post(roomsEndpoint('tutoro3'))
        .send(samples.rooms[0])
        .expect(403)
        .end(function (err, res) {
          expect(err).to.be(null);
          expect(res.body.message).to.be.eql('EMAIL_NOT_VERIFIED');
          done();
        });
    });
  });

  const messageChecker = function (message, redisKey) {
    const expectedJson = sender => lodash.extend({ from: sender }, message);

    return (sender, cb) => test.redisClient.lindex(redisKey, 0, function (err, json) {
      expect(err).to.be(null);
      expect(JSON.parse(json)).to.eql(expectedJson(sender));
      cb();
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
    });
    const roomId = samples.rooms[0].id;
    const redisKey = `${test.prefix}:${roomId}:messages`;

    const checkMessage = messageChecker(message, redisKey);

    // before(function() {
    //   spies.sendNotification = sinon.spy();
    //   spies.refreshTtl = roomManager.refreshTtl = sinon.spy(saveRefreshTtl);
    // });  
  
    it('adds message to a room', done => {
      expect(test.spies.refreshTtl.callCount).to.be(0);
      test.go()
      .post(systemMessagesEndpoint(process.env.API_SECRET))
      .send(payload)
      .expect(200)
      .end(function (err, res) {
        expect(err).to.be(null);
        checkMessage('$$', function () {
 
          // refreshes room's ttl
          expect(test.spies.refreshTtl.callCount).to.be(1);
          expect(test.spies.refreshTtl.getCall(0).args[0]).to.be(samples.rooms[0].id);

          // calls sendNotification for everyone in the room
          expect(test.spies.sendNotification.callCount).to.be(2);
          const expectCall = function (index, username) {
            const callArgs = test.spies.sendNotification.getCall(index).args;
            const notification = callArgs[0];
            expect(notification.to).to.be(username);
            expect(notification.data).to.eql(lodash.extend({
              roomId: samples.rooms[0].id,
              from: '$$'
            }, message));
          };
          expectCall(0, 'alice');
          expectCall(1, 'bob');
  
          done();
        });
      });
    });
  
  });

  describe('POST /<auth>/rooms/:roomId/messages', function () {
    const message = {
      timestamp: Date.now(),
      type: 'text',
      message: 'Newest message'
    };

    const roomId = samples.rooms[0].id;
    const redisKey = `${test.prefix}:${roomId}:messages`;

    const checkMessage = messageChecker(message, redisKey);
  
    it('adds message to a room', done =>
    test.go()
        .post(messagesEndpoint('alice', roomId))
        .send(message)
        .expect(200)
        .end(function (err, res) {
          expect(err).to.be(null);
          checkMessage('alice', function () {
            // refreshes room\'s ttl
            expect(test.spies.refreshTtl.callCount).to.be(1);
            expect(test.spies.refreshTtl.getCall(0).args[0]).to.be(samples.rooms[0].id);
            done();
          });
        }));

    it('calls sendNotification() for everyone in the room but sender', done => {
      test.go()
      .post(messagesEndpoint('alice', roomId))
      .send(message)
      .end(function (err, res) {
        expect(test.spies.sendNotification.callCount).to.be(1);
        const callArgs = test.spies.sendNotification.getCall(0).args;
        const notification = callArgs[0];
        expect(notification.to).to.be('bob');
        expect(notification.data).to.eql(lodash.extend({
          roomId: samples.rooms[0].id,
          from: 'alice'
        }, message));
        done();
      });
    });

    it('does not call sendNotification() if policies.shouldNotify returns false', done => {
      test.redisUsermeta.set('alice:$blocked', 'bob');
      test.go()
        .post(messagesEndpoint('bob', samples.rooms[0].id))
        .send(message)
        .expect(200)
        .end(function (err, res) {
          expect(err).to.be(null);
          expect(test.spies.sendNotification.callCount).to.be(0);
          done();
        })
    });

    it('allows access with :authToken being API_SECRET', done => test.go()
      .post(messagesEndpoint(process.env.API_SECRET, roomId))
      .send(message)
      .expect(200)
      .end(function (err, res) {
        expect(err).to.be(null);
        checkMessage('$$', done);
      }));

    it('401 when user is not in the room', done => test.go()
      .post(messagesEndpoint('alice', samples.rooms[1].id))
      .expect(401, done));

    it('401 on invalid auth tokens', done => test.go()
      .post(messagesEndpoint('no-username-hence-no-token', roomId))
      .expect(401, done));

    it('404 when room is not found', done => test.go()
      .post(messagesEndpoint('alice', 'non-existent-room'))
      .expect(404, done));

    it('403 when user is banned', done => {
      test.redisUsermeta.set('bob:$banned', '1');
      test.go()
        .post(messagesEndpoint('bob', roomId))
        .expect(403)
        .end(function (err) {
          expect(err).to.be(null);
          done();
        });
    });

    it('403 if user doesnt have email', done => {
      test.go()
        .post(messagesEndpoint('tutoro', roomId))
        .expect(403)
        .end(function (err, res) {
          expect(err).to.be(null);
          expect(res.body.message).to.be.eql('EMAIL_NOT_VERIFIED');
          done();
        });
    });

    it('403 if user is not confirmed', done => {
      test.go()
        .post(messagesEndpoint('tutoro2', roomId))
        .expect(403)
        .end(function (err, res) {
          expect(err).to.be(null);
          expect(res.body.message).to.be.eql('EMAIL_NOT_VERIFIED');
          done();
        });
    });
    it('403 if user last email is not confirmed', done => {
      test.go()
        .post(messagesEndpoint('tutoro3', roomId))
        .expect(403)
        .end(function (err, res) {
          expect(err).to.be(null);
          expect(res.body.message).to.be.eql('EMAIL_NOT_VERIFIED');
          done();
        });
    });
  });
});
