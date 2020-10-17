import assert from 'assert';
import bans, { BansClient, RealClient, FakeClient } from '../src/bans';
import fakeredis from 'fakeredis';
fakeredis.fast = true;

describe('bans', function() {
  describe('createClient()', function() {
    it('returns FakeClient when redis usermeta client is missing and prints warnings', function() {
      const log = {
        warnCallCount: 0,
        warn(_obj, message: string) {
          this.warnCallCount++;
          assert(/^Redis Usermeta is missing/.test(message));
        }
      };

      const client: BansClient = bans.createClient(null, log as any);
      assert(client instanceof FakeClient);
      assert(log.warnCallCount === 1);
    });

    it('returns RealClient when redis usermeta is specified', function() {
      const redisUsermeta = fakeredis.createClient();
      const client:RealClient = bans.createClient(redisUsermeta) as RealClient;
      assert(client instanceof RealClient);
      assert(!!client.redisUsermeta);
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

    it('returns true for existing bans', function(done) {
      const redisUsermeta = fakeredis.createClient();
      redisUsermeta.set("alice:$banned", "1476531925454");
      const client = new bans.RealClient(redisUsermeta);

      client.isBanned('alice', function(err, banned) {
        assert(err === null);
        assert(banned === true);
        done();
      });
    });

    it('returns false for non-existing bans', function(done) {
      const client = new bans.RealClient(fakeredis.createClient());

      client.isBanned('alice', function(err, banned) {
        assert(err === null);
        assert(banned === false);
        done();
      });
    });
  });
});
