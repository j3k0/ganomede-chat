/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import restify from 'restify';

class RealClient {
  constructor(addr, port, log) {
    const url = `http://${addr}:${port}`;
    this.api = restify.createJsonClient({url});
    this.log = log;
  }

  // true if @username is banned
  // false otherwise
  // callback(err, boolean)
  isBanned(username, callback) {
    const url = `/users/v1/banned-users/${encodeURIComponent(username)}`;
    return this.api.get(url, (err, req, res, banInfo) => {
      if (err) {
        this.log.error({username, err}, 'Failed to check ban info');
        return callback(err);
      }

      return callback(null, !!banInfo.exists);
    });
  }
}

// When users service is not configured,
// consider every account to be in good standing (not banned).
class FakeClient {
  isBanned(username, callback) {
    const fn = () => callback(null, false);
    return process.nextTick(fn);
  }
}

const createClient = function(env, log) {
  const addr = env.USERS_PORT_8080_TCP_ADDR || null;
  const port = env.USERS_PORT_8080_TCP_PORT || null;
  const exists = addr && port;

  if (exists) {
    return new RealClient(addr, port, log);
  }

  log.warn({addr, port}, 'Env missing some vars, using fake client (no bans)');
  return new FakeClient();
};

export default {createClient, RealClient, FakeClient};
