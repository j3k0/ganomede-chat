import lodash from 'lodash';

class Message {
  constructor(sender, payload) {
    if (!sender) {
      throw new Error('bad sender');
    }

    if (!payload) {
      throw new Error('bad payload');
    }

    if (!isFinite(payload.timestamp)) {
      throw new Error('bad timestamp');
    }

    if (!payload.type) {
      throw new Error('bad type');
    }

    if (!payload.message) {
      throw new Error('bad message');
    }

    lodash.extend(this, {from: sender}, lodash.pick(payload, [
      'timestamp', 'type', 'message'
    ]));
  }
}

export default Message;
