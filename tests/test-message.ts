/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import expect from 'expect.js';
import lodash from 'lodash';
import Message from '../src/message';

describe('Message', () => describe('new Message()', function() {
  const ctor = (sender, payload) => new Message(sender, payload);

  it('creates Message', function() {
    const plain = {timestamp: Date.now(), type: 'text', message: 'Hi!'};
    const m = new Message('alice', plain);

    expect(m).to.be.a(Message);
    expect(m).to.only.have.keys(Object.keys(plain).concat('from'));
    expect(lodash.pick(m, Object.keys(plain))).to.eql(plain);
    return expect(m.from).to.be('alice');
  });

  return describe('throws an error when', function() {
    const throws = function(message, ...ctorArgs) {
      const expectation = expect(ctor);
      const call = expectation.withArgs.apply(expectation, ctorArgs);
      return call.to.throwException(new RegExp(`^${message}$`));
    };

    it('sender arg is invalid', function() {
      throws('bad sender');
      throws('bad sender', null);
      return throws('bad sender', '');
    });

    it('payload arg is invalid', function() {
      throws('bad payload', 'sender');
      throws('bad payload', 'sender', null);
      return throws('bad payload', 'sender', 0);
    });

    it('payload.timestamp is invalid', function() {
      throws('bad timestamp', 'sender', {});
      throws('bad timestamp', 'sender', {timestamp: Infinity});
      return throws('bad timestamp', 'sender', {timestamp: 'smthmasd'});
    });

    it('payload.type is invalid', function() {
      throws('bad type', 'sender', {timestamp: Date.now()});
      throws('bad type', 'sender', {timestamp: Date.now(), type: null});
      return throws('bad type', 'sender', {timestamp: Date.now(), type: ''});
    });

    return it('payload.message is invalid', function() {
      throws('bad message',
             'sender', {timestamp: Date.now(), type: 'text'});

      throws('bad message',
             'sender', {timestamp: Date.now(), type: 'text', message: null});

      return throws('bad message',
             'sender', {timestamp: Date.now(), type: 'text', message: ''});
    });
  });
}));
