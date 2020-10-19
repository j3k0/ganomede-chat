import lodash from 'lodash';

export interface MessageList {
  items: (callback: (err: Error | null, items: Message[]) => void) => void;
  add: (message: Message, callback: (err: Error | null, nMessages?: number) => void) => void;
}

export interface MessagePayload {
  timestamp: number;
  type: string;
  message: string;
}

export class Message {

  from: string;
  timestamp: number;
  type: string;
  message: string;

  constructor(sender: string, payload: MessagePayload) {

    // Make typescript happy
    this.from = '';
    this.timestamp = 0;
    this.type = '';
    this.message = '';

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
