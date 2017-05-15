assert = require('assert')
bans = require('../src/bans')

describe 'bans', () ->
  describe 'createClient()', () ->
    it 'returns FakeClient if env vars are missing and prints warnings', () ->
      log = {
        warnCallCount: 0
        warn: (obj, message) ->
          @warnCallCount++
          assert(obj.addr == null)
          assert(obj.port == null)
          assert(/^Env missing some vars/.test(message))
      }

      client = bans.createClient({}, log)
      assert(client instanceof bans.FakeClient)
      assert(log.warnCallCount == 1)

    it 'returns RealClient when env has props', () ->
      env = {
        USERS_PORT_8080_TCP_ADDR: 'domain.tld',
        USERS_PORT_8080_TCP_PORT: 999
      }

      client = bans.createClient(env)
      assert(client instanceof bans.RealClient)
      assert(client.api.url.href == 'http://domain.tld:999/')

  describe 'FakeClient', () ->
    it '#isBanned() always returns false on next tick', (done) ->
      sameTick = true

      new bans.FakeClient().isBanned 'someone', (err, banned) ->
        assert(err == null)
        assert(banned == false)
        assert(sameTick == false)
        done()

      sameTick = false


  describe 'RealClient', () ->
    reply = (banned) ->
      return {
        "username": "alice",
        "exists": banned,
        "createdAt": banned ? 1476531925454 : 0
      }

    fakeApi = (banned) ->
      return {
        get: (url, cb) ->
          assert(url, '/users/v1/banned-users/alice')
          assert(cb instanceof Function)
          process.nextTick(() -> cb(null, {}, {}, reply(banned)))
      }

    it 'returns true for existing bans', (done) ->
      client = new bans.RealClient('domain.tld', 999, {})
      client.api = fakeApi(true)

      client.isBanned 'alice', (err, banned) ->
        assert(err == null)
        assert(banned == true)
        done()

    it 'returns false for non-existing bans', () ->
      client = new bans.RealClient('domain.tld', 999, {})
      client.api = fakeApi(false)

      client.isBanned 'alice', (err, banned) ->
        assert(err == null)
        assert(banned == false)
        done()
