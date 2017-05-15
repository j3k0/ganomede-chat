restify = require('restify')

class RealClient
  constructor: (addr, port, log) ->
    url = "http://#{addr}:#{port}"
    @api = restify.createJsonClient({url})
    @log = log

  # true if @username is banned
  # false otherwise
  # callback(err, boolean)
  isBanned: (username, callback) ->
    url = "/users/v1/banned-users/#{encodeURIComponent(username)}"
    this.api.get url, (err, req, res, banInfo) =>
      if (err)
        @log.error({username, err}, 'Failed to check ban info')
        return callback(err)

      callback(null, !!banInfo.exists)

# When users service is not configured,
# consider every account to be in good standing (not banned).
class FakeClient
  isBanned: (username, callback) ->
    fn = () -> callback(null, false)
    process.nextTick(fn)

createClient = (env, log) ->
  addr = env.USERS_PORT_8080_TCP_ADDR || null
  port = env.USERS_PORT_8080_TCP_PORT || null
  exists = addr && port

  if (exists)
    return new RealClient(addr, port, log)

  log.warn({addr, port}, 'Env missing some vars, using fake client (no bans)')
  return new FakeClient()

module.exports = {createClient, RealClient, FakeClient}
