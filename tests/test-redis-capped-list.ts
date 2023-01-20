/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import fakeredis from 'fakeredis';
import expect from 'expect.js';
import RedisCappedList from '../src/redis-capped-list';
// import config from '../src/config';
fakeredis.fast = true;

describe('RdisCappedList', function() {
  const redisClient = fakeredis.createClient();

  const id = key => `ganomede:test:redis-capped-list:${key}`;

  const instance = function(options) {
    if (options == null) { options = {}; }
    options.redis = options.redis || redisClient;
    options.maxSize = options.maxSize || 3;

    return new RedisCappedList(options);
  };

  const item = idx => ({
    item: idx
  });

  describe('#items()', function() {
    const itemsInserted = [1, 2, 3, 4, 5, 6, 7].map(item);
    const redisKey = id('#items()');

    before(function(done) {
      const jsons = itemsInserted.map(item => JSON.stringify(item));
      const args = [redisKey as any].concat(jsons).concat(done);
      redisClient.rpush.apply(redisClient, args);
    });

    after(done => { redisClient.del(redisKey, done); });

    it('returns items in the list', function(done) {
      const list = instance({id: redisKey});
      list.items(function(err, items) {
        expect(err).to.be(null);
        expect(items).to.eql(itemsInserted);
        done();
      });
    });

    return it('returns empty array if there are no items or key', function(done) {
      const list = instance({id: 'w/ever'});
      list.items(function(err, items) {
        expect(err).to.be(null);
        expect(items).to.eql([]);
        done();
      });
    });
  });

  describe('#add()', function() {
    const redisKey = id('#add()');
    const list = instance({id: redisKey, maxSize: 2});

    after(done => redisClient.del(redisKey, done));

    it('adds element to the list', done => {
      list.add(item(1), function (err, newSize) {
        expect(err).to.be(null);
        expect(newSize).to.be(1);
        done();
      });
    });

    it('element is added to the beginning', done => {
      list.add(item(2), function (err, newSize) {
        expect(err).to.be(null);
        expect(newSize).to.be(2);

        redisClient.lrange(redisKey, 0, -1, function (err, items) {
          expect(err).to.be(null);
          expect(JSON.parse(items[0])).to.eql(item(2));
          done();
        });
      });
    });

    it('if list is too big, removes 1 element from the tail (oldest)', done => {
      list.add(item(3), function (err, newSize) {
        expect(err).to.be(null);
        expect(newSize).to.be(2);

        redisClient.lrange(redisKey, 0, -1, function (err, items) {
          expect(err).to.be(null);
          expect(items.map(JSON.parse.bind(JSON) as any)).to.eql([3, 2].map(item));
          done();
        });
      });
    });
  });
});
