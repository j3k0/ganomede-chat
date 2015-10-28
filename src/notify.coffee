async = require 'async'
helpers = require 'ganomede-helpers'
config = require '../config'

# Sends notification of a message to everyone but sender.
notify = (sendFn, roomParticipants, message, push) ->
  receievers = roomParticipants.filter (username) ->
    return username != message.from

  async.each receievers, (receiver, cb) ->
    options = {
      from: config.pkg.api
      to: receiver
      type: 'message'
      data: message
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
