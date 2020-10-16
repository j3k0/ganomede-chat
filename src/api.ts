/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import async from 'async';
import redis from 'redis';
import AuthDB from 'authdb';
import restify from 'restify';
import helpers from 'ganomede-helpers';
import lodash from 'lodash';
import config from '../config';
import RoomManager from './room-manager';
import Message from './message';
import log from './log';
import notify from './notify';

export default function(options) {
  if (options == null) { options = {}; }
  const authDb = options.authDb || AuthDB.createClient({
    host: config.authdb.host,
    port: config.authdb.port
  });

  const roomManager = options.roomManager || new RoomManager({
    redis: redis.createClient({
      host: config.redis.host,
      port: config.redis.port
    }),

    prefix: config.redis.prefix,
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  });

  const sendNotification = options.sendNotification || helpers.Notification.sendFn(1);

  const authMiddleware = helpers.restify.middlewares.authdb.create({
    authdbClient: authDb
  });

  const {
    bansClient
  } = options;
  if (!options.bansClient) {
    throw new TypeError('Please provide options.bansClient');
  }

  const apiSecretOrAuthMiddleware = function(req, res, next) {
    if (req.params.authToken === process.env.API_SECRET) {
      req.params.apiSecret = true;
      return next();
    }

    return authMiddleware(req, res, next);
  };

  const requireSecret = function(req, res, next) {
    if (!req.params.apiSecret) {
      return next(new restify.UnauthorizedError);
    }
    return next();
  };

  const checkIfBanned = function(req, res, next) {
    if (req.params.apiSecret === true) {
      return next();
    }

    const {
      username
    } = req.params.user;

    return bansClient.isBanned(username, function(err, banned) {
      if (err) {
        log.error({err, username}, 'Failed to check ban');
        return next(new restify.InteralServerError());
      }

      if (banned) {
        log.info({username}, 'User banned');
        return next(new restify.ForbiddenError());
      }

      return next();
    });
  };

  const fetchRoom = (req, res, next) => roomManager.findById(req.params.roomId, function(err, room) {
    if (err) {
      log.error('fetchRoom() failed', {
        err,
        roomId: req.params.roomId
      }
      );
      return next(new restify.InteralServerError);
    }

    if (!room) {
      return next(new restify.NotFoundError);
    }

    if (!req.params.apiSecret && !room.hasUser(req.params.user.username)) {
      return next(new restify.UnauthorizedError);
    }

    req.params.room = room;
    return next();
  });

  const fetchMessages = (req, res, next) => req.params.room.messages(function(err, messages) {
    if (err) {
      log.error('fetchMessages() failed', {
        err,
        room: req.params.room,
        messageList: req.params.room.messageList.id
      }
      );
      return next(new restify.InteralServerError);
    }

    req.params.messages = messages;
    return next();
  });

  const createRoom = fetchMessages => (function(req, res, next) {
    if (req.params.authToken !== process.env.API_SECRET) {
      if (!(req.body.users.indexOf(req.params.user.username) >= 0)) {
        return next(new restify.UnauthorizedError);
      }
    }
    return roomManager.create(req.body || {}, function(err, room) {
      if (err) {
        if (err.message === RoomManager.errors.INVALID_CREATION_OPTIONS) {
          return next(new restify.BadRequestError);
        }

        if (err.message === RoomManager.errors.ROOM_EXISTS) {
          const id = RoomManager.Room.id(req.body);

          return async.waterfall([
            roomManager.findById.bind(roomManager, id),
            function(room, cb) {
              if (fetchMessages) {
                return room.messages((err, messages) => cb(err, room, messages));
              } else {
                return cb(null, room, []);
              }
            }
          ], function(err, room, messages) {
            if (err) {
              log.error('createRoom() failed to retrieve existing room', {
                err,
                body: req.body
              }
              );
              return next(new restify.InteralServerError);
            }

            req.params.room = room;
            req.params.messages = messages;
            return refreshRoom(req, res, next);
          });
        }

        log.error('createRoom() failed', {
          err,
          body: req.body
        }
        );
        return next(new restify.InteralServerError);
      }

      req.params.room = room;
      req.params.messages = [];
      return next();
    });
  });

  const sendRoomJson = function(req, res, next) {
    if (res.headersSent) {
      return next();
    }

    const reply = lodash.extend({messages: req.params.messages}, req.params.room);
    res.json(reply);
    return next();
  };

  const addMessage = forcedType => (function(req, res, next) {
    let message;
    try {
      if (forcedType) {
        req.body.type = forcedType;
      }
      const username = req.params.apiSecret ? '$$' : req.params.user.username;
      message = new Message(username, req.body);
    } catch (e) {
      return next(new restify.BadRequestError(e.message));
    }

    return req.params.room.addMessage(message, function(err, nMessages) {
      if (err) {
        log.err('addMessage() failed', {
          err,
          body: req.body
        }
        );
        return next(new restify.InteralServerError);
      }

      notify(sendNotification, req.params.room, message, req.body.push);
      res.send(200);
      return next();
    });
  });

  var refreshRoom = function(req, res, next) {
    roomManager.refreshTtl(req.params.room.id, function(err, retval) {
      if (err || (retval !== 1)) {
        return log.err('refreshRoom() failed', {
          err,
          retval,
          roomId: req.params.room.id
        }
        );
      }
    });

    return next();
  };

  return function(prefix, server) {
    // create room
    server.post(`${prefix}/auth/:authToken/rooms`,
      apiSecretOrAuthMiddleware,
      checkIfBanned,
      createRoom(true),
      sendRoomJson);

    // read messages
    server.get(`/${prefix}/auth/:authToken/rooms/:roomId`,
      apiSecretOrAuthMiddleware,
      fetchRoom,
      fetchMessages,
      sendRoomJson);

    // add message
    server.post(`/${prefix}/auth/:authToken/rooms/:roomId/messages`,
      apiSecretOrAuthMiddleware,
      checkIfBanned,
      fetchRoom,
      addMessage(),
      refreshRoom);

    // add service message
    return server.post(`/${prefix}/auth/:authToken/system-messages`,
      apiSecretOrAuthMiddleware,
      requireSecret,
      createRoom(false),
      addMessage('event'),
      refreshRoom);
  };
};
