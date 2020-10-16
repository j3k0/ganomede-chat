import assert from 'assert';

const defaultExport = function () {
  const ret: {
    _nCalls: number;
    _callArgs: any[];
    _results: any;
    isBanned(username: string, callback);
  } = {
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
  };
  return ret;
};

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
