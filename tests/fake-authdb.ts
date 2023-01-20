/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
export class AuthdbClient {
  store: any;
  constructor() {
    this.store = {};
  }
  addAccount(token, user) {
    this.store[token] = user;
  }
  getAccount(token, cb) {
    if (!this.store[token]) {
      cb("invalid authentication token");
    }
    else {
      cb(null, this.store[token]);
    }
  }
}

export default {createClient() { return new AuthdbClient; }};

// vim: ts=2:sw=2:et:
