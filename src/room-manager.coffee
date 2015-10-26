RedisCappedList = require './redis-capped-list'

class Room
  constructor: (info, messageList) ->
    for own key, val of info
      @[key] = val

    unless @id
      @id = Room.id(info)

    # Define invisible property, so it doesn't get json'd,
    # but still is accessible to prototype functions.
    if (messageList)
      @_setMessageList(messageList)

  _setMessageList: (list) ->
    Object.defineProperty(@, 'messageList', {value: list})

  messages: (callback) ->
    @messageList.items(callback)

  addMessage: (message, callback) ->
    @messageList.add(message, callback)

  @id: (info) ->
    return "#{info.type}/#{info.users.sort().join('/')}"

class RoomManager
  constructor: (options={}) ->
    @redis = options.redis
    @prefix = options.prefix
    @ttlMillis = options.ttlMillis
    @maxSize = options.maxSize

    unless @redis
      throw new Error('options.redis is required')

    unless @prefix
      throw new Error('options.prefix is required')

    unless @ttlMillis
      throw new Error('options.ttlMillis is required')

    unless @maxSize
      throw new Error('options.maxSize is required')


  #
  # Redis Keys
  #

  key: (keys...) ->
    return "#{@prefix}:#{keys.join(':')}"

  messagesKey: (roomId) ->
    return @key(roomId, 'messages')

  messageList: (roomId) ->
    return new RedisCappedList({
      redis: @redis,
      maxSize: @maxSize,
      id: @messagesKey(roomId)
    })

  create: (options, callback) ->
    tickError = (message) ->
      err = new Error(message)
      process.nextTick(callback.bind(null, err))

    unless options.type
      return tickError('options.type is required')

    unless Array.isArray(options.users) && (options.users.length > 0)
      return tickError('options.users must be non-empty Array')

    room = new Room(options)

    @redis.set @key(room.id), JSON.stringify(room), 'PX', @ttlMillis, 'NX',
    (err, created) =>
      if (err)
        return callback(err)

      if (!created)
        return callback(new Error(RoomManager.errors.ROOM_EXISTS))

      room._setMessageList(@messageList(room.id))
      callback(null, room)

  findById: (roomId, callback) ->
    @redis.get @key(roomId), (err, room) =>
      if (err)
        return callback(err)

      if (!room)
        return callback(null, null)

      info = JSON.parse(room)
      list = @messageList(roomId)
      callback(null, new Room(info, list))

  refreshTtl: (roomId, callback) ->
    @redis.pexpire @key(roomId), @ttlMillis, callback

  @errors: {
    ROOM_EXISTS: 'ROOM_EXISTS'
  }

  @Room: Room

module.exports = RoomManager
