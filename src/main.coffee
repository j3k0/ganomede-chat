helpers = require 'ganomede-helpers'
api = require './api'
log = require './log'
bans = require './bans'

module.exports = (prefix, server) ->
  log.info "main(prefix=#{prefix})"

  helpers.restify.apis.ping()(prefix, server)
  helpers.restify.apis.about()(prefix, server)

  chatApi = api({bansClient: bans.createClient(process.env, log)})
  chatApi(prefix, server)
