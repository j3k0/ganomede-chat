vasync = require 'vasync'

class PubSub
  constructor: (pubsub) ->
    @pub = pubsub.publisher
    @sub = pubsub.subscriber
    @channel = pubsub.channel
    @listening = false

    if !@pub
      throw new Error 'PubSub() requires pubsub.pub to be Redis client'
    if !@sub
      throw new Error 'PubSub() requires pubsub.sub to be Redis client'
    if @pub == @sub
      # while in subscription mode, redis client can't send other commands,
      # that's why we need anther connection
      throw new Error 'PubSub() requires pubsub.pub != pubsub.sub'
    if !@channel
      throw new Error 'PubSub() requires pubsub.channel to be a nonempty string'

  subscribe: (handler) ->
    @sub.on('message', handler)

    if !@listening
      @listening = true
      @sub.subscribe(@channel)

  quit: (callback) ->
    vasync.parallel
      funcs: [
        @pub.quit.bind(@pub),
        @sub.quit.bind(@sub)
      ], callback


module.exports = PubSub
