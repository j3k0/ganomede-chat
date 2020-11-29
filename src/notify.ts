import async from 'async';
import lodash from 'lodash';
import config from './config';
import log from './log';
import { Room } from './room-manager';
import Message from './message';
import { NotificationPayload, Notification, SendNotificationFunction } from './helpers/send-notification';
import { PoliciesClient } from './policies';

// Sends notification of a message to everyone but sender.
const notify = function(policies: PoliciesClient, sendFn: SendNotificationFunction, room: Room, message: Message, push?: any): void {

  const receivers: string[] = room.users.filter((username: string) => username !== message.from);
  // log.info({receivers}, 'notfiy');

  async.each(receivers, function (receiver: string, cb: () => void): void {
    // log.info({receiver}, 'shouldNotify?')
    policies.shouldNotify(message.from, receiver, (err: Error | null, policiesOK: boolean, errorNotification?: Notification): void => {
      if (!policiesOK) {
        log.info({ sender: message.from, receiver }, 'notify skipped (policies)');
        if (errorNotification) {
          sendFn(new NotificationPayload(errorNotification), function (_err, _response) {});
        }
        return cb();
      }

      const options: Notification = {
        from: config.pkg.api,
        to: receiver,
        type: 'message',
        data: lodash.extend({ roomId: room.id }, message)
      };

      if (push) {
        options.push = push;
      }

      const notification = new NotificationPayload(options);
      sendFn(notification, function (err, response) {
        if (err) {
          log.warn({ err, notification, response }, 'notify failed');
        }
        cb();
      });
    });
  });
};

export default notify;
