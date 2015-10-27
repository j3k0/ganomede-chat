expect = require 'expect.js'
lodash = require 'lodash'
Message = require '../src/message'

describe 'Message', () ->
  describe 'new Message()', () ->
    ctor = (sender, payload) ->
      return new Message(sender, payload)

    it 'creates Message', () ->
      plain = {timestamp: Date.now(), type: 'text', message: 'Hi!'}
      m = new Message('alice', plain)

      expect(m).to.be.a(Message)
      expect(m).to.only.have.keys(Object.keys(plain).concat('from'))
      expect(lodash.pick(m, Object.keys(plain))).to.eql(plain)
      expect(m.from).to.be('alice')

    describe 'throws an error when', () ->
      throws = (message, ctorArgs...) ->
        expectation = expect(ctor)
        call = expectation.withArgs.apply(expectation, ctorArgs)
        call.to.throwException(new RegExp("^#{message}$"))

      it 'sender arg is invalid', () ->
        throws('bad sender')
        throws('bad sender', null)
        throws('bad sender', '')

      it 'payload arg is invalid', () ->
        throws('bad payload', 'sender')
        throws('bad payload', 'sender', null)
        throws('bad payload', 'sender', 0)

      it 'payload.timestamp is invalid', () ->
        throws('bad timestamp', 'sender', {})
        throws('bad timestamp', 'sender', {timestamp: Infinity})
        throws('bad timestamp', 'sender', {timestamp: 'smthmasd'})

      it 'payload.type is invalid', () ->
        throws('bad type', 'sender', {timestamp: Date.now()})
        throws('bad type', 'sender', {timestamp: Date.now(), type: null})
        throws('bad type', 'sender', {timestamp: Date.now(), type: ''})

      it 'payload.message is invalid', () ->
        throws('bad message',
               'sender', {timestamp: Date.now(), type: 'text'})

        throws('bad message',
               'sender', {timestamp: Date.now(), type: 'text', message: null})

        throws('bad message',
               'sender', {timestamp: Date.now(), type: 'text', message: ''})
