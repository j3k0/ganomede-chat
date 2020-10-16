/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import helpers from 'ganomede-helpers';
import api from './api';
import log from './log';
import bans from './bans';

export default function(prefix, server) {
  log.info(`main(prefix=${prefix})`);

  helpers.restify.apis.ping()(prefix, server);
  helpers.restify.apis.about()(prefix, server);

  const chatApi = api({bansClient: bans.createClient(process.env, log)});
  return chatApi(prefix, server);
};
