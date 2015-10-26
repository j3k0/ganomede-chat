redis = require 'redis'
AuthDB = require 'authdb'
restify = require 'restify'
helpers = require 'ganomede-helpers'
lodash = require 'lodash'
config = require '../config'
RoomManager = require './room-manager'
log = require './log'

module.exports = (options={}) ->
  authDb = options.authDb || AuthDB.createClient(
    host: config.authdb.host
    port: config.authdb.port
  )

  roomManager = options.roomManager || new RoomManager({
    redis: redis.createClient({
      host: config.redis.host,
      port: config.redis.port
    }),

    prefix: config.redis.prefix,
    ttlMillis: config.redis.ttlMillis,
    maxSize: config.redis.maxRoomMessages
  })

  authMiddleware = helpers.restify.middlewares.authdb.create({
    authdbClient: authDb
  })

  apiSecretOrAuthMiddleware = (req, res, next) ->
    if req.params.authToken == process.env.API_SECRET
      req.params.apiSecret = true
      return next()

    authMiddleware(req, res, next)

  fetchRoom = (req, res, next) ->
    roomManager.findById req.params.roomId, (err, room) ->
      if (err)
        log.error 'fetchRoom() failed',
          err: err,
          roomId: req.params.roomId
        return next(new restify.InteralServerError)

      unless room
        return next(new restify.NotFoundError)

      unless req.params.apiSecret || room.hasUser(req.params.user.username)
        return next(new restify.UnauthorizedError)

      req.params.room = room
      next()

  fetchMessages = (req, res, next) ->
    req.params.room.messages (err, messages) ->
      if (err)
        log.error 'fetchMessages() failed',
          err: err,
          room: req.params.room,
          messageList: req.params.room.messageList.id
        return next(new restify.InteralServerError)

      req.params.messages = messages
      next()

  return (prefix, server) ->
    server.get "/#{prefix}/auth/:authToken/rooms/:roomId",
      apiSecretOrAuthMiddleware,
      fetchRoom,
      fetchMessages,
      (req, res, next) ->
        reply = lodash.extend({messages: req.params.messages}, req.params.room)
        res.json(reply)
        next()