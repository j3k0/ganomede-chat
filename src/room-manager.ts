/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS203: Remove `|| {}` from converted for-own loops
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import RedisCappedList from './redis-capped-list';
import Message, { MessageList } from './message';
import { RedisClient } from 'redis';

export interface RoomInfo {
  id?: string;
  type: string;
  users: string[];
}

export class Room implements RoomInfo {
  id: string = '';
  type: string = '';
  users: string[] = [];
  messageList?: MessageList;

  constructor(info: RoomInfo, messageList?: MessageList) {

    for (let key of Object.keys(info)) {
      this[key] = info[key];
    }

    if (!info.id) {
      this.id = Room.id(info);
    }

    // Define invisible property, so it doesn't get json'd,
    // but still is accessible to prototype functions.
    if (messageList) {
      this._setMessageList(messageList);
    }
  }

  _setMessageList(list: MessageList) {
    return Object.defineProperty(this, 'messageList', { value: list });
  }

  messages(callback) {
    return this.messageList?.items(callback);
  }

  addMessage(message: Message, callback: (err: Error | null, nMessages?: number) => void) {
    return this.messageList?.add(message, callback);
  }

  hasUser(username) {
    return -1 !== this.users.indexOf(username);
  }

  static id(info: RoomInfo): string {
    return `${info.type}/${info.users?.sort().join('/')}`;
  }
}

export interface RoomManagerOptions {
  redis: RedisClient;
  prefix: string;
  ttlMillis: number;
  maxSize: number;
}

export class RoomManager {

  redis: RedisClient;
  prefix: string;
  ttlMillis: number;
  maxSize: number;

  static errors = {
    ROOM_EXISTS: 'ROOM_EXISTS',
    INVALID_CREATION_OPTIONS: 'INVALID_CREATION_OPTIONS'
  };

  constructor(options: RoomManagerOptions) {
    this.redis = options.redis;
    this.prefix = options.prefix;
    this.ttlMillis = options.ttlMillis;
    this.maxSize = options.maxSize;

    if (!this.redis) {
      throw new Error('options.redis is required');
    }

    if (!this.prefix) {
      throw new Error('options.prefix is required');
    }

    if (!this.ttlMillis) {
      throw new Error('options.ttlMillis is required');
    }

    if (!this.maxSize) {
      throw new Error('options.maxSize is required');
    }
  }


  //
  // Redis Keys
  //

  key(...keys: string[]): string {
    return `${this.prefix}:${keys.join(':')}`;
  }

  messagesKey(roomId: string): string {
    return this.key(roomId, 'messages');
  }

  messageList(roomId: string): MessageList {
    return new RedisCappedList({
      redis: this.redis,
      maxSize: this.maxSize,
      id: this.messagesKey(roomId)
    });
  }

  create(options, callback) {
    const tickError = function (message) {
      const err = new Error(message);
      return process.nextTick(callback.bind(null, err));
    };

    if (!options.type) {
      return tickError(RoomManager.errors.INVALID_CREATION_OPTIONS);
    }

    if (!Array.isArray(options.users) || (!(options.users.length > 0))) {
      return tickError(RoomManager.errors.INVALID_CREATION_OPTIONS);
    }

    const room = new Room(options);

    return this.redis.set(this.key(room.id), JSON.stringify(room), 'PX', this.ttlMillis, 'NX',
      (err, created) => {
        if (err) {
          return callback(err);
        }

        if (!created) {
          return callback(new Error(RoomManager.errors.ROOM_EXISTS));
        }

        room._setMessageList(this.messageList(room.id));
        return callback(null, room);
      });
  }

  findById(roomId, callback) {
    return this.redis.get(this.key(roomId), (err, room) => {
      if (err) {
        return callback(err);
      }

      if (!room) {
        return callback(null, null);
      }

      const info = JSON.parse(room);
      const list = this.messageList(roomId);
      return callback(null, new Room(info, list));
    });
  }

  refreshTtl(roomId, callback) {
    return this.redis.pexpire(this.key(roomId), this.ttlMillis, callback);
  }
}

export default RoomManager;
