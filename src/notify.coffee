async = require 'async'
lodash = require 'lodash'
helpers = require 'ganomede-helpers'
config = require '../config'
log = require './log'

# Sends notification of a message to everyone but sender.
notify = (sendFn, room, message, push) ->
  receievers = room.users.filter (username) ->
    return username != message.from

  async.each receievers, (receiver, cb) ->
    options = {
      from: config.pkg.api
      to: receiver
      type: 'message'
      data: lodash.extend({roomId: room.id}, message)
    }

    if push
      options.push = push

    notification = new helpers.Notification(options)

    sendFn notification, (err, response) ->
      if (err)
        log.err 'notify failed',
          err: err,
          notification: notification
          response: response

      cb()

module.exports = notify
