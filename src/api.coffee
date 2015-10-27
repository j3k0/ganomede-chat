async = require 'async'
redis = require 'redis'
AuthDB = require 'authdb'
restify = require 'restify'
helpers = require 'ganomede-helpers'
lodash = require 'lodash'
config = require '../config'
RoomManager = require './room-manager'
Message = require './message'
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

  createRoom = (req, res, next) ->
    roomManager.create req.body || {}, (err, room) ->
      if (err)
        if (err.message == RoomManager.errors.INVALID_CREATION_OPTIONS)
          return next(new restify.BadRequestError)

        if (err.message == RoomManager.errors.ROOM_EXISTS)
          id = RoomManager.Room.id(req.body)

          return async.waterfall [
            roomManager.findById.bind(roomManager, id),
            (room, cb) ->
              room.messages (err, messages) ->
                cb(err, room, messages)
          ], (err, room, messages) ->
            if (err)
              log.error 'createRoom() failed to retrieve existing room',
                err: err,
                body: req.body
              return next(new restify.InteralServerError)

            req.params.room = room
            req.params.messages = messages
            next()

        log.error 'createRoom() failed',
          err: err,
          body: req.body
        return next(new restify.InteralServerError)

      req.params.room = room
      req.params.messages = []
      next()

  sendRoomJson = (req, res, next) ->
    if res.headersSent
      return next()

    reply = lodash.extend({messages: req.params.messages}, req.params.room)
    res.json(reply)
    next()

  addMessage = (req, res, next) ->
    try
      username = if req.params.apiSecret then '$$' else req.params.user.username
      message = new Message(username, req.body)
    catch e
      return next(new restify.BadRequestError(e.message))

    req.params.room.addMessage message, (err, nMessages) ->
      if (err)
        log.err 'addMessage() failed',
          err: err
          body: req.body
        return next(new restify.InteralServerError)

      res.send(200)
      next()

  return (prefix, server) ->
    server.post "#{prefix}/auth/:authToken/rooms",
      apiSecretOrAuthMiddleware,
      createRoom,
      sendRoomJson

    server.get "/#{prefix}/auth/:authToken/rooms/:roomId",
      apiSecretOrAuthMiddleware,
      fetchRoom,
      fetchMessages,
      sendRoomJson

    server.post "/#{prefix}/auth/:authToken/rooms/:roomId/messages",
      apiSecretOrAuthMiddleware,
      fetchRoom,
      addMessage
