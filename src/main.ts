import api, { ApiOptions } from './api';
import log from './log';
import policies from './policies';
import aboutApi from './about-api';
import pingApi from './ping-api';
import { Server } from 'restify';
import redis, { RedisClient } from 'redis';

export default function(prefix: string, server: Server, options?: Partial<ApiOptions>) {
  log.info(`main(prefix=${prefix})`);

  pingApi.addRoutes(prefix, server);
  aboutApi.addRoutes(prefix, server);

  let redisUsermeta: RedisClient | null = null;
  if (process.env.REDIS_USERMETA_PORT_6379_TCP_ADDR) {
    redisUsermeta = redis.createClient({
      host: process.env.REDIS_USERMETA_PORT_6379_TCP_ADDR,
      port: +(process.env.REDIS_USERMETA_PORT_6379_TCP_PORT || '6379'),
    });
  }
  const chatApi = api(Object.assign({
    policiesClient: policies.createClient(redisUsermeta, log),
  }, options));
  chatApi(prefix, server);
};
