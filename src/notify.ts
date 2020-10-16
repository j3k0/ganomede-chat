import async from 'async';
import lodash from 'lodash';
import config from './config';
import log from './log';
import { Room } from './room-manager';
import Message from './message';
import { NotificationPayload, Notification, SendNotificationFunction } from './helpers/send-notification';

// Sends notification of a message to everyone but sender.
const notify = function(sendFn: SendNotificationFunction, room: Room, message: Message, push?: any) {

  // TODO: also remove blocked users
  const receivers: string[] = room.users.filter((username: string) => username !== message.from);

  return async.each(receivers, function(receiver, cb) {
    const options: Notification = {
      from: config.pkg.api,
      to: receiver,
      type: 'message',
      data: lodash.extend({roomId: room.id}, message)
    };

    if (push) {
      options.push = push;
    }

    const notification = new NotificationPayload(options);

    return sendFn(notification, function(err, response) {
      if (err) {
        log.warn({
          err,
          notification,
          response
        }, 'notify failed');
      }
      cb();
    });
  });
};

export default notify;
