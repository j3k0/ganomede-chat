import api, { ApiOptions } from './api';
import log from './log';
import bans from './bans';
import aboutApi from './about-api';
import pingApi from './ping-api';
import { Server } from 'restify';

export default function(prefix: string, server: Server, options?: Partial<ApiOptions>) {
  log.info(`main(prefix=${prefix})`);

  pingApi.addRoutes(prefix, server);
  aboutApi.addRoutes(prefix, server);

  const chatApi = api(Object.assign({
    bansClient: bans.createClient(process.env, log)
  }, options));
  chatApi(prefix, server);
};
