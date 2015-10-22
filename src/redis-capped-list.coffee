parseJson = JSON.parse.bind(JSON)

class RedisCappedList
  constructor: (options) ->
    @redis = options.redis
    @maxSize = options.maxSize
    @maxIndex = @maxSize - 1
    @id = options.id

    unless @redis
      throw new Error('options.redis requried')

    unless @maxSize
      throw new Error('options.maxSize requried')

    unless @id
      throw new Error('options.id required')

  items: (callback) ->
    @redis.lrange @id, 0, -1, (err, items) ->
      if (err)
        return callback(err)

      callback(null, items.map(parseJson))

  add: (item, callback) ->
    @redis.multi()
      .lpush(@id, JSON.stringify(item))
      .ltrim(@id, 0, @maxIndex)
      .llen(@id)
      .exec (err, results) ->
        if (err)
          return callback(err)

        callback(null, results[2])


module.exports = RedisCappedList
