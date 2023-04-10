/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import async from 'async';
import redis, { RedisClient } from 'redis';
import AuthDB from 'authdb';
import restifyErrors from 'restify-errors';
import lodash from 'lodash';
import config from './config';
import RoomManager, { Room } from './room-manager';
import Message from './message';
import log from './log';
import notify from './notify';
import { PoliciesClient } from './policies';
import authdbHelper from './helpers/authdb-helper';
import SendNotification, { SendNotificationFunction } from './helpers/send-notification';
import { RequestHandler } from 'restify';

export interface ApiOptions {
  roomManager?: RoomManager;
  redisClient?: RedisClient;
  authDb?: any;
  sendNotification?: SendNotificationFunction;
  policiesClient: PoliciesClient;
}

export default function (options: ApiOptions) {
  if (options == null) 
    throw new TypeError('Please provide options.policiesClient');

    const authDb = options.authDb || AuthDB.createClient({
    host: config.authdb.host,
    port: config.authdb.port
  });

  const roomManager = options.roomManager || new RoomManager({
    redis: options.redisClient || redis.createClient({
      host: config.redis.host,
      port: config.redis.port
    }),

    prefix: config.redis.prefix,
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  });

  const sendNotification = options.sendNotification || SendNotification.createWithDefaults(true);

  const authMiddleware = authdbHelper.create({
    authdbClient: authDb,
    secret: config.secret || ''
  });

  const policiesClient:PoliciesClient = options.policiesClient;
  if (!options.policiesClient) {
    throw new TypeError('Please provide options.policiesClient');
  }

  const apiSecretOrAuthMiddleware = function (req, res, next) {
    if (req.params.authToken === process.env.API_SECRET) {
      req.params.apiSecret = true;
      next();
      return;
    }

    authMiddleware(req, res, next);
  };

  const requireSecret = function (req, res, next) {
    if (!req.params.apiSecret) {
      next(new restifyErrors.UnauthorizedError);
    }
    next();
  };

  const checkIfHasDisabledChat = function (req, res, next) {
    if (req.params.apiSecret === true) {
      next();
      return;
    }

    const {
      username
    } = req.params.user;

    policiesClient.hasDisabledChat(username, function (err, hasHasDisabledChat) {
      if (err) {
        log.error({ err, username }, 'Failed to check ban');
        next(new restifyErrors.InternalServerError());
        return;
      }

      if (hasHasDisabledChat) {
        log.info({ username }, 'User has disabled chat');
        next(new restifyErrors.ForbiddenError());
        return;
      }

      next();
    });
  };

  const checkIfBanned = function (req, res, next) {
    if (req.params.apiSecret === true) {
      next();
      return;
    }

    const {
      username
    } = req.params.user;

    policiesClient.isBanned(username, function (err, banned) {
      if (err) {
        log.error({ err, username }, 'Failed to check ban');
        next(new restifyErrors.InternalServerError());
        return;
      }

      if (banned) {
        log.info({ username }, 'User banned');
        next(new restifyErrors.ForbiddenError());
        return;
      }

      next();
    });
  };

  const checkIfMuted = function (req, res, next) {
    if (req.params.apiSecret === true) {
      next();
      return;
    }

    const username = req.params.user.username;

    policiesClient.isMuted(username, function (err, muted) {
      if (err) {
        log.error({ err, username }, 'Failed to check muted');
        next(new restifyErrors.InternalServerError());
        return;
      }

      req.params.muted = muted;
      if (muted) {
        log.info({ username }, 'User muted');
      }
      next();
    });
  };

  const fetchRoom = (req, res, next) => roomManager.findById(req.params.roomId, function (err, room) {
    if (err) {
      log.error('fetchRoom() failed', {
        err,
        roomId: req.params.roomId
      }
      );
      next(new restifyErrors.InternalServerError());
      return;
    }

    if (!room) {
      next(new restifyErrors.NotFoundError());
      return;
    }

    if (!req.params.apiSecret && !room.hasUser(req.params.user.username)) {
      next(new restifyErrors.UnauthorizedError());
      return;
    }

    req.params.room = room;
    next();
  });

  const fetchMessages = (req, res, next) => req.params.room.messages(function (err, messages) {
    if (err) {
      log.error('fetchMessages() failed', {
        err,
        room: req.params.room,
        messageList: req.params.room.messageList.id
      }
      );
      next(new restifyErrors.InternalServerError());
      return;
    }

    req.params.messages = messages;
    next();
  });

  const createRoom = (fetchMessages: boolean, refreshTtl: boolean): RequestHandler => (function (req, res, next) {
    if (req.params.authToken !== process.env.API_SECRET) {
      if (!(req.body.users.indexOf(req.params.user.username) >= 0)) {
        next(new restifyErrors.UnauthorizedError());
        return;
      }
    }
    roomManager.create(req.body || {}, function (err, room) {
      if (err) {
        if (err.message === RoomManager.errors.INVALID_CREATION_OPTIONS) {
          next(new restifyErrors.BadRequestError());
          return;
        }

        if (err.message === RoomManager.errors.ROOM_EXISTS) {
          const id = Room.id(req.body);

          return async.waterfall([
            roomManager.findById.bind(roomManager, id),
            function (room, cb) {
              if (fetchMessages) {
                return room.messages((err, messages) => cb(err, room, messages));
              } else {
                return cb(null, room, []);
              }
            }
          ], function (err, room, messages) {
            if (err) {
              req.log.warn({ err, body: req.body }, 'createRoom() failed to retrieve existing room');
              next(new restifyErrors.InternalServerError());
            }

            req.params.room = room;
            req.params.messages = messages;
            if (refreshTtl) {
              // req.log.info('createRoom > refreshRoom');
              refreshRoom(req, res, next);
            }
            else
              next();
          });
        }

        log.error({err, body: req.body}, 'createRoom() failed');
        next(new restifyErrors.InternalServerError());
      }

      req.params.room = room;
      req.params.messages = [];
      next();
    });
  });

  const sendRoomJson = function (req, res, next) {
    if (res.headersSent) {
      next();
      return;
    }

    const reply = lodash.extend({ messages: req.params.messages }, req.params.room);
    res.json(reply);
    next();
  };

  const addMessage = (forcedType?: string) => (function (req, res, next) {
    if (req.params.muted) {
      next();
      return;
    }
    let message: Message;
    try {
      if (forcedType) {
        req.body.type = forcedType;
      }
      const username:string = req.params.apiSecret ? '$$' : req.params.user.username;
      message = new Message(username, req.body);
    } catch (e) {
      req.log.warn({err:e}, 'Bad Request');
      next(new restifyErrors.BadRequestError((e as any).message));
      return;
    }

    const room:Room = req.params.room;
    room.addMessage(message, function (err, nMessages) {
      if (err) {
        log.error({
          err,
          body: req.body
        }, 'addMessage() failed');
        next(new restifyErrors.InternalServerError());
        return;
      }

      notify(policiesClient, sendNotification, req.params.room, message, req.body.push);
      res.send(200);
      next();
    });
  });

  // in production, we won't wait for the ttl to has been refresh.
  // in dev, we will (so tests won't fail)
  const refreshRoom: RequestHandler = function (req, _res, next) {
    // req.log.info('refreshRoom');
    roomManager.refreshTtl(req.params.room.id, function (err, retval) {
      if (err || (retval !== 1)) {
        req.log.warn({ err, retval, roomId: req.params.room.id }, 'refreshRoom() failed');
      }
      if (config.debug)
        next();
    });
    if (!config.debug)
      next();
  };

  return function (prefix, server) {
    // create room
    server.post(`/${prefix}/auth/:authToken/rooms`,
      apiSecretOrAuthMiddleware,
      checkIfBanned,
      createRoom(true, true),
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
      checkIfHasDisabledChat,
      checkIfBanned,
      checkIfMuted,
      fetchRoom,
      addMessage(),
      refreshRoom);

    // add service message
    server.post(`/${prefix}/auth/:authToken/system-messages`,
      apiSecretOrAuthMiddleware,
      requireSecret,
      createRoom(false, false),
      addMessage('event'),
      refreshRoom);
  };
};
