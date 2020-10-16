/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import supertest from 'supertest';
import expect from 'expect.js';
import helpers from 'ganomede-helpers';
import main from '../src/main';
import config from '../config';

describe('Main', function() {
  const server = helpers.restify.createServer();
  const go = supertest.bind(null, server);

  const endpoint = function(path) {
    if (path == null) { path = '/'; }
    return `/${config.routePrefix}${path}`;
  };

  before(() => main(config.routePrefix, server));

  after(done => server.close(done));

  it('/ping', done => go()
    .get(endpoint('/ping/stuff'))
    .expect(200, 'pong/stuff', done));

  return it('/about', done => go()
    .get('/about')
    .expect(200)
    .end(function(err, res) {
      expect(err).to.be(null);
      expect(res.body).to.be.an(Object);
      expect(res.body).to.have.property('type', config.pkg.type);
      return done();
  }));
});
