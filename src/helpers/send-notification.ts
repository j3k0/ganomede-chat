import ServiceEnv from './service-env';
import * as superagent from 'superagent';
import log from '../log';

export const REQUIRED_KEYS = ['from', 'to', 'type'];
export const OPTIONAL_KEYS = ['data', 'push', 'secret'];
export const SERVERSIDE_KEYS = ['id', 'timestamp'];

function required(options: Notification, key: keyof Notification): string {
  if (!options[key])
    throw new Error("Required key missing: `" + key + "`");
  return options[key];
}

export type SendNotificationCallback = (err?: Error, body?: any) => void;
export type SendNotificationFunction = (notification: Notification, callback?: SendNotificationCallback) => void;

export interface Notification {
  secret?: string;
  from: string;
  to: string;
  type: string;
  data?: any,
  push?: {
    app: string;
    title: string[];
    message: string[];
    messageArgsTypes: string[];
  }
}

export class NotificationPayload implements Notification {

  from: string;
  to: string;
  type: string;
  secret?: string;
  data?: any;
  push?: {
    app: string;
    title: string[];
    message: string[];
    messageArgsTypes: string[];
  }

  constructor(options: Notification) {

    this.from = required(options, 'from');
    this.to = required(options, 'to');
    this.type = required(options, 'type');

    this.secret = options.secret;
    this.data = options.data;
    this.push = options.push;
  }
}

export function sendNotification(baseURL: string, notification: Notification, callback?: SendNotificationCallback) {
  if (!notification.secret) {
    notification.secret = process.env.API_SECRET;
  }

  const url = `${baseURL}/notifications/v1/messages`;
  // log.info({ url, notification }, "sending notification");

  return superagent
    .post(url)
    .send(notification)
    .end(function (err, res) {
      if (err) {
        log.warn({ err, url, notification }, 'sendNotification() failed');
      }

      if (typeof callback === 'function')
        callback(err, res.body);
    });
};

export function createWithDefaults(noopIfNotFound: boolean = false): SendNotificationFunction {
  if (!ServiceEnv.exists('NOTIFICATIONS', 8080)) {
    if (!noopIfNotFound) {
      throw new Error("Notification.sendFn() failed to find NOTIFICATIONS service address in environment variables");
    }
    return function () {
      const callback = arguments[arguments.length - 1];
      if (typeof callback === "function")
        callback(null);
    };
  }
  const baseURL = ServiceEnv.url('NOTIFICATIONS', 8080);
  return function (notification: Notification, callback?: SendNotificationCallback) {
    if (!baseURL) {
      if (callback)
        callback(new Error('Notification service misconfigured'));
      return;
    }
    sendNotification(baseURL, notification, callback);
  };
};

export default {
  create(baseURL): SendNotificationFunction {
    return (notification: Notification, callback?: SendNotificationCallback) => {
      if (!baseURL) {
        if (callback)
          callback(new Error('Notification service misconfigured'));
        return;
      }
      sendNotification(baseURL, notification, callback);
    }
  },
  createWithDefaults
};

// vim: ts=2:sw=2:et: