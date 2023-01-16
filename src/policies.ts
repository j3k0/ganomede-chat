import Logger from 'bunyan';
import logMod from './log';
import { RedisClient } from 'redis';
import { Notification } from './helpers/send-notification';
import pkg = require('../package.json');

export type PoliciesClientCallback = (err: Error | null, result: boolean, errorNotification?: Notification) => void;

export interface PoliciesClient {
  isBanned(username: string, callback: PoliciesClientCallback): void;
  isEmailConfirmed(username: string, callback: PoliciesClientCallback): void;
  shouldNotify(sender: string, receiver: string, callback: PoliciesClientCallback): void;
}

export interface RealClientOptions {
  redisUsermeta?: RedisClient;
  log: Logger;
}

export class RealClient implements PoliciesClient {
  log: Logger;
  redisUsermeta: RedisClient;

  constructor(redisUsermeta: RedisClient, log: Logger = logMod) {
    this.log = log;
    this.redisUsermeta = redisUsermeta;
  }

  // true if @username is banned
  // false otherwise
  // callback(err, boolean)
  isBanned(username: string, callback: PoliciesClientCallback) {
    this.redisUsermeta.get(`${username}:$banned`, (err: Error | null, value: string | null) => {
      if (err) {
        this.log.warn({username, err}, 'Failed to check ban info');
        callback(null, false);
      }
      else {
        callback(null, !!value);
      }
    });
  }

  // true if the email of @username is confirmed 
  // false otherwise
  // callback(err, boolean)
  isEmailConfirmed(username: string, callback: PoliciesClientCallback) {
    //we need to get the email of the user and confirmations info.
    this.redisUsermeta.mget([`${username}:email`, `${username}:ConfirmedOn`], (err: Error | null, values: string[]) => {
      if (err) {
        this.log.warn({ username, err }, 'Failed to check policies');
        callback(null, true);
      }
      const [email, ConfirmedOn] = values;
      //checking if email exists...
      if (email === '' || email === null || email === undefined) {
        this.log.info({ username }, 'user doesnt have an email');
        return callback(null, false);
      }
      //checking if confirmation info exists.
      if (ConfirmedOn === '' || ConfirmedOn === null || ConfirmedOn === undefined) {
        this.log.info({ username }, 'confirmed on object is empty');
        return callback(null, false);
      }

      try {
        //ConfirmedOn is like {'test@emain.com': 1232423424, 'another@email.com': 1233242342}
        //for each email confirmed => there is a timestamp of confirmation.
        //parsing the strin to an object.
        const confirmations: { [key: string]: number } = JSON.parse(ConfirmedOn);

        //checking if the current email of the user is confirmed.
        //then we callback with true.
        if (confirmations[email]) {
          return callback(null, true);
        }
      } catch (e) {
        this.log.warn({ e }, 'Failed to parse ConfirmedOn');
      }
      callback(null, false);
    });
  }

  shouldNotify(sender: string, receiver: string, callback: PoliciesClientCallback): void {
    // logMod.info('RealPoliciesClient > should notify?');
    this.redisUsermeta.mget([`${receiver}:$blocked`, `${receiver}:$chatdisabled`], (err: Error | null, values: string[]) => {
      if (err) {
        this.log.warn({sender, receiver, err}, 'Failed to check policies');
        callback(null, true);
      }
      const [blocked, chatDisabled] = values;
      // if (banned) {
      //   this.log.info({sender}, 'do not notify: sender is banned');
      //   return callback(null, false);
      // }
      if (chatDisabled === 'true') {
        this.log.info({receiver}, 'do not notify: chat disabled for receiver');
        const errNotification: Notification = {
          from: pkg.api,
          to: sender,
          type: 'chat-disabled',
          data: { receiver },
        };
        return callback(null, false, errNotification);
      }
      if (blocked) {
        const blockedArray = blocked.split(',');
        const isSenderBlocked = (blockedArray.indexOf(sender) >= 0);
        if (isSenderBlocked) {
          this.log.info({sender, receiver}, 'do not notify: receiver blocked the sender.');
          return callback(null, false);
        }
      }
      callback(null, true);
    });
  }
}

// When users service is not configured,
// consider every account to be in good standing (not banned).
export class FakeClient {
  isBanned(_username: string, callback: PoliciesClientCallback) {
    const fn = () => callback(null, false);
    return process.nextTick(fn);
  }
  isEmailConfirmed(_username: string, callback: PoliciesClientCallback) {
    const fn = () => callback(null, true);
    return process.nextTick(fn);
  }
  shouldNotify(_sender: string, _receiver: string, callback: PoliciesClientCallback) {
    // logMod.info('FakePoliciesClient > should notify?');
    const fn = () => callback(null, false);
    return process.nextTick(fn);
  }
}

export function createClient(redisUsermeta: RedisClient | null | undefined, log: Logger = logMod) {

  if (redisUsermeta) {
    return new RealClient(redisUsermeta, log);
  }

  log.warn({}, 'Redis Usermeta is missing, using fake client (no bans, blocked, etc)');
  return new FakeClient();
};

export default { createClient, RealClient, FakeClient };
