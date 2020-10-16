/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from 'assert';
import bans from '../src/bans';

describe('bans', function() {
  describe('createClient()', function() {
    it('returns FakeClient if env vars are missing and prints warnings', function() {
      const log = {
        warnCallCount: 0,
        warn(obj, message) {
          this.warnCallCount++;
          assert(obj.addr === null);
          assert(obj.port === null);
          return assert(/^Env missing some vars/.test(message));
        }
      };

      const client = bans.createClient({}, log);
      assert(client instanceof bans.FakeClient);
      return assert(log.warnCallCount === 1);
    });

    return it('returns RealClient when env has props', function() {
      const env = {
        USERS_PORT_8080_TCP_ADDR: 'domain.tld',
        USERS_PORT_8080_TCP_PORT: 999
      };

      const client = bans.createClient(env);
      assert(client instanceof bans.RealClient);
      return assert(client.api.url.href === 'http://domain.tld:999/');
    });
  });

  describe('FakeClient', () => it('#isBanned() always returns false on next tick', function(done) {
    let sameTick = true;

    new bans.FakeClient().isBanned('someone', function(err, banned) {
      assert(err === null);
      assert(banned === false);
      assert(sameTick === false);
      return done();
    });

    return sameTick = false;
  }));


  return describe('RealClient', function() {
    const reply = banned => ({
      "username": "alice",
      "exists": banned,
      "createdAt": banned != null ? banned : {1476531925454 : 0}
    });

    const fakeApi = banned => ({
      get(url, cb) {
        assert(url, '/users/v1/banned-users/alice');
        assert(cb instanceof Function);
        return process.nextTick(() => cb(null, {}, {}, reply(banned)));
      }
    });

    it('returns true for existing bans', function(done) {
      const client = new bans.RealClient('domain.tld', 999, {});
      client.api = fakeApi(true);

      return client.isBanned('alice', function(err, banned) {
        assert(err === null);
        assert(banned === true);
        return done();
      });
    });

    return it('returns false for non-existing bans', function() {
      const client = new bans.RealClient('domain.tld', 999, {});
      client.api = fakeApi(false);

      return client.isBanned('alice', function(err, banned) {
        assert(err === null);
        assert(banned === false);
        return done();
      });
    });
  });
});
