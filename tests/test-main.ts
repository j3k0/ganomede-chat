import restify from 'restify';
import fakeredis from 'fakeredis';
import supertest from 'supertest';
import expect from 'expect.js';
import main from '../src/main';
import config from '../src/config';
import fakeAuthdb from './fake-authdb';
fakeredis.fast = true;

describe('Main', function() {
  const server = restify.createServer();
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser());
  server.use(restify.plugins.gzipResponse())
  const go = supertest.bind(null, server);

  const endpoint = function(path) {
    if (path == null) { path = '/'; }
    return `/${config.routePrefix}${path}`;
  };

  before(() => {
    main(config.routePrefix, server, {
      redisClient: fakeredis.createClient(),
      authDb: fakeAuthdb.createClient()
    });
  });

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
