import assert from 'assert';
import bans, { PoliciesClient, RealClient, FakeClient } from '../src/policies';
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

      const client: PoliciesClient = bans.createClient(null, log as any);
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


  describe('RealClient', function() {

    describe('isBanned', function() {

      it('returns true for existing bans', function(done) {
        const redisUsermeta = fakeredis.createClient();
        redisUsermeta.set("alice:$banned", "1476531925454");
        const client = new RealClient(redisUsermeta);
        client.isBanned('alice', function(err, banned) {
          assert(err === null);
          assert(banned === true);
          done();
        });
      });
  
      it('returns false for non-existing bans', function(done) {
        const client = new RealClient(fakeredis.createClient());
        client.isBanned('alice', function(err, banned) {
          assert(err === null);
          assert(banned === false);
          done();
        });
      });
    });

    describe('shouldNotify', function() {

      it('returns false if the sender is blocked', function(done) {
        const redisUsermeta = fakeredis.createClient();
        redisUsermeta.set("bob:$blocked", "zero,alice,charles");
        const client = new RealClient(redisUsermeta);
        client.shouldNotify('alice', 'bob', function(err, notify) {
          assert(err === null);
          assert(notify === false);
          done();
        });
      });

      it('returns false if the receiver has disabled the chat', function(done) {
        const redisUsermeta = fakeredis.createClient();
        redisUsermeta.set("bob:$chatdisabled", "true");
        const client = new RealClient(redisUsermeta);
        client.shouldNotify('alice', 'bob', function(err, notify) {
          assert(err === null);
          assert(notify === false);
          done();
        });
      });

      it('returns true in other cases', function(done) {
        const client = new RealClient(fakeredis.createClient());
        client.shouldNotify('alice', 'bob', function(err, notify) {
          assert(err === null);
          assert(notify === true);
          done();
        });
      });

    });
  });
});
