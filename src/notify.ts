/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import async from 'async';
import lodash from 'lodash';
import helpers from 'ganomede-helpers';
import config from '../config';
import log from './log';

// Sends notification of a message to everyone but sender.
const notify = function(sendFn, room, message, push) {
  const receievers = room.users.filter(username => username !== message.from);

  return async.each(receievers, function(receiver, cb) {
    const options = {
      from: config.pkg.api,
      to: receiver,
      type: 'message',
      data: lodash.extend({roomId: room.id}, message)
    };

    if (push) {
      options.push = push;
    }

    const notification = new helpers.Notification(options);

    return sendFn(notification, function(err, response) {
      if (err) {
        log.error('notify failed', {
          err,
          notification,
          response
        }
        );
      }

      return cb();
    });
  });
};

export default notify;
