helpers = require 'ganomede-helpers'
api = require './api'
log = require './log'

module.exports = (prefix, server) ->
  log.info "main(prefix=#{prefix})"

  helpers.restify.apis.ping()(prefix, server)
  helpers.restify.apis.about()(prefix, server)

  chatApi = api()
  chatApi(prefix, server)
