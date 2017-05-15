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
notify = require './notify'

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

  sendNotification = options.sendNotification || helpers.Notification.sendFn(1)

  authMiddleware = helpers.restify.middlewares.authdb.create({
    authdbClient: authDb
  })

  bansClient = options.bansClient
  unless options.bansClient
    throw new TypeError('Please provide options.bansClient')

  apiSecretOrAuthMiddleware = (req, res, next) ->
    if req.params.authToken == process.env.API_SECRET
      req.params.apiSecret = true
      return next()

    authMiddleware(req, res, next)

  requireSecret = (req, res, next) ->
    unless req.params.apiSecret
      return next(new restify.UnauthorizedError)
    next()

  checkIfBanned = (req, res, next) ->
    if (req.params.apiSecret == true)
      return next()

    username = req.params.user.username

    bansClient.isBanned username, (err, banned) ->
      if (err)
        log.error({err, username}, 'Failed to check ban')
        return next(new restify.InteralServerError())

      if (banned)
        log.info({username}, 'User banned')
        return next(new restify.ForbiddenError())

      next()

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

  createRoom = (fetchMessages) -> (req, res, next) ->
    if req.params.authToken != process.env.API_SECRET
      unless req.body.users.indexOf(req.params.user.username) >= 0
        return next(new restify.UnauthorizedError)
    roomManager.create req.body || {}, (err, room) ->
      if (err)
        if (err.message == RoomManager.errors.INVALID_CREATION_OPTIONS)
          return next(new restify.BadRequestError)

        if (err.message == RoomManager.errors.ROOM_EXISTS)
          id = RoomManager.Room.id(req.body)

          return async.waterfall [
            roomManager.findById.bind(roomManager, id),
            (room, cb) ->
              if (fetchMessages)
                room.messages (err, messages) ->
                  cb(err, room, messages)
              else
                cb(null, room, [])
          ], (err, room, messages) ->
            if (err)
              log.error 'createRoom() failed to retrieve existing room',
                err: err,
                body: req.body
              return next(new restify.InteralServerError)

            req.params.room = room
            req.params.messages = messages
            refreshRoom(req, res, next)

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

  addMessage = (forcedType) -> (req, res, next) ->
    try
      if (forcedType)
        req.body.type = forcedType
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

      notify(sendNotification, req.params.room, message, req.body.push)
      res.send(200)
      next()

  refreshRoom = (req, res, next) ->
    roomManager.refreshTtl req.params.room.id, (err, retval) ->
      if (err || retval != 1)
        log.err 'refreshRoom() failed',
          err: err
          retval: retval
          roomId: req.params.room.id

    next()

  return (prefix, server) ->
    # create room
    server.post "#{prefix}/auth/:authToken/rooms",
      apiSecretOrAuthMiddleware,
      checkIfBanned,
      createRoom(true),
      sendRoomJson

    # read messages
    server.get "/#{prefix}/auth/:authToken/rooms/:roomId",
      apiSecretOrAuthMiddleware,
      fetchRoom,
      fetchMessages,
      sendRoomJson

    # add message
    server.post "/#{prefix}/auth/:authToken/rooms/:roomId/messages",
      apiSecretOrAuthMiddleware,
      checkIfBanned,
      fetchRoom,
      addMessage(),
      refreshRoom

    # add service message
    server.post "/#{prefix}/auth/:authToken/system-messages",
      apiSecretOrAuthMiddleware,
      requireSecret,
      createRoom(false),
      addMessage('event'),
      refreshRoom
