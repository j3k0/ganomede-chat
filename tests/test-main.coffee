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

  # describe 'config.removeServiceVersion()', () ->
  #   test = (name, unversionedName) ->
  #     actual = config.removeServiceVersion(name)
  #     expected = if arguments.length == 1 then name else unversionedName
  #     expect(actual).to.be(expected)

  #   it 'returns name without a version from versioned service name', () ->
  #     test('service/v1', 'service')
  #     test('service/something/v1', 'service/something')

  #   it 'returns original string if no version is present', () ->
  #     test('service')
  #     test('service/v')
  #     test('service/v-2')
  #     test('service/vABC')
  #     test('service/not-a-version/more?')
