/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from 'assert';
const defaultExport = {};

defaultExport = function() { return {
  _nCalls: 0,
  _callArgs: [],
  _results: {},
  isBanned(username, callback) {
    ++this._nCalls;
    this._callArgs.push(username);
    const banned = username.indexOf('banned-') === 0;
    this._results[username] = banned;
    return process.nextTick(() => callback(null, banned));
  }
}; };

describe('fake-bans-client', function() {
  const bansClient = defaultExport();

  it('returns false for regular usernames', done => bansClient.isBanned('alice', function(err, banned) {
    assert(err === null);
    assert(banned === false);
    return done();
  }));

  return it('returns true for `banned-*` usernames', done => bansClient.isBanned('banned-joe', function(err, banned) {
    assert(err === null);
    assert(banned === true);
    return done();
  }));
});
export default defaultExport;
