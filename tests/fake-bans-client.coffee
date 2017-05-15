assert = require 'assert'

module.exports = () -> {
  _nCalls: 0
  _callArgs: []
  _results: {}
  isBanned: (username, callback) ->
    ++@_nCalls
    @_callArgs.push(username)
    banned = username.indexOf('banned-') == 0
    @_results[username] = banned
    process.nextTick(() -> callback(null, banned))
}

describe 'fake-bans-client', () ->
  bansClient = module.exports()

  it 'returns false for regular usernames', (done) ->
    bansClient.isBanned 'alice', (err, banned) ->
      assert(err == null)
      assert(banned == false)
      done()

  it 'returns true for `banned-*` usernames', (done) ->
    bansClient.isBanned 'banned-joe', (err, banned) ->
      assert(err == null)
      assert(banned == true)
      done()
