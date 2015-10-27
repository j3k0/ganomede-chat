lodash = require 'lodash'

class Message
  constructor: (sender, payload) ->
    unless sender
      throw new Error('bad sender')

    unless payload
      throw new Error('bad payload')

    unless isFinite(payload.timestamp)
      throw new Error('bad timestamp')

    unless payload.type
      throw new Error('bad type')

    unless payload.message
      throw new Error('bad message')

    lodash.extend(this, {from: sender}, lodash.pick(payload, [
      'timestamp', 'type', 'message'
    ]))

module.exports = Message
