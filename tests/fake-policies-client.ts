import assert from 'assert';
import { PoliciesClientCallback, PoliciesClient } from '../src/policies';

export interface FakePoliciesClient extends PoliciesClient {
  _nCalls: number;
  _callArgs: any[];
  _results: any;
  // isBanned(username: string, callback: PoliciesClientCallback);
  // shouldNotify(sender: string, receiver: string, callback: PoliciesClientCallback);
};

const defaultExport = function () {
  const ret: FakePoliciesClient = {
    _nCalls: 0,
    _callArgs: [],
    _results: {},
    isBanned(username, callback) {
      ++this._nCalls;
      this._callArgs.push(username);
      const banned = username.indexOf('banned-') === 0;
      this._results[username] = banned;
      return process.nextTick(() => callback(null, banned));
    },
    shouldNotify(sender: string, receiver: string, callback: PoliciesClientCallback) {
      // console.log('FakePolicies: should notify ' + sender + ' > ' + receiver);
      ++this._nCalls;
      this._callArgs.push([sender, receiver]);
      const banned = sender.indexOf('banned-') === 0;
      const blocked = sender.indexOf('blocked-') === 0;
      this._results[sender + '-' + receiver] = banned;
      return process.nextTick(() => callback(null, !banned && !blocked));
    }
  };
  return ret;
};

describe('fake-policies-client', function () {
  const policiesClient = defaultExport();

  it('isBanned returns false for regular usernames', done =>
    policiesClient.isBanned('alice', function (err, banned) {
      assert(err === null);
      assert(banned === false);
      done();
    }));

  it('isBanned true for `banned-*` usernames', done =>
    policiesClient.isBanned('banned-joe', function (err, banned) {
      assert(err === null);
      assert(banned === true);
      done();
    }));

  it('shouldNotify returns false for `blocked-*` usernames', done =>
    policiesClient.shouldNotify('blocked-joe', 'whoever', function (err, notify) {
      assert(err === null);
      assert(notify === false);
      done();
    }));

  it('shouldNotify returns true for other usernames', done =>
    policiesClient.shouldNotify('joe', 'whoever', function (err, notify) {
      assert(err === null);
      assert(notify === true);
      done();
    }));
});
export default defaultExport;
