supertest = require 'supertest'
expect = require 'expect.js'
helpers = require 'ganomede-helpers'
main = require '../src/main'
config = require '../config'

describe 'Main', () ->
  server = helpers.restify.createServer()
  go = supertest.bind(null, server)

  endpoint = (path='/') ->
    return "/#{config.routePrefix}#{path}"

  before () ->
    main(config.routePrefix, server)

  after (done) ->
    server.close(done)

  it '/ping', (done) ->
    go()
      .get endpoint('/ping/stuff')
      .expect(200, 'pong/stuff', done)

  it '/about', (done) ->
    go()
      .get('/about')
      .expect(200)
      .end (err, res) ->
        expect(err).to.be(null)
        expect(res.body).to.be.an(Object)
        expect(res.body).to.have.property('type', config.pkg.type)
        done()
