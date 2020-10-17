import Logger from 'bunyan';
import logMod from './log';
import { RedisClient } from 'redis';

export type BansClientCallback = (err: Error | null, banned: boolean) => void;

export interface BansClient {
  isBanned(username: string, callback: BansClientCallback): void;
}

export interface RealClientOptions {
  redisUsermeta?: RedisClient;
  log: Logger;
}

export class RealClient implements BansClient {
  log: Logger;
  redisUsermeta: RedisClient;

  constructor(redisUsermeta: RedisClient, log: Logger = logMod) {
    this.log = log;
    this.redisUsermeta = redisUsermeta;
  }

  // true if @username is banned
  // false otherwise
  // callback(err, boolean)
  isBanned(username: string, callback: BansClientCallback) {
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
}

// When users service is not configured,
// consider every account to be in good standing (not banned).
export class FakeClient {
  isBanned(_username: string, callback: BansClientCallback) {
    const fn = () => callback(null, false);
    return process.nextTick(fn);
  }
}

export function createClient(redisUsermeta: RedisClient | null | undefined, log: Logger = logMod) {

  if (redisUsermeta) {
    return new RealClient(redisUsermeta, log);
  }

  log.warn({}, 'Redis Usermeta is missing, using fake client (no bans)');
  return new FakeClient();
};

export default { createClient, RealClient, FakeClient };
