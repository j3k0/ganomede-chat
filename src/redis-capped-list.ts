import { RedisClient } from "redis";
import Message, { MessageList } from "./message";

const parseJson: (s:string) => Message = JSON.parse.bind(JSON);

export interface RedisCappedListOptions {
  redis: RedisClient;
  maxSize: number;
  id: string;
}

class RedisCappedList implements MessageList {

  redis: RedisClient;
  maxSize: number;
  maxIndex: number;
  id: string;
  
  constructor(options: RedisCappedListOptions) {
    this.redis = options.redis;
    this.maxSize = options.maxSize;
    this.maxIndex = this.maxSize - 1;
    this.id = options.id;

    if (!this.redis) {
      throw new Error('options.redis requried');
    }

    if (!this.maxSize) {
      throw new Error('options.maxSize requried');
    }

    if (!this.id) {
      throw new Error('options.id required');
    }
  }

  items(callback: (err: Error | null, items: Message[]) => void) {
    return this.redis.lrange(this.id, 0, -1, function(err: Error | null, items: string[]) {
      if (err) {
        return callback(err, []);
      }
      callback(null, items.map(parseJson));
    });
  }

  add(item, callback) {
    return this.redis.multi()
      .lpush(this.id, JSON.stringify(item))
      .ltrim(this.id, 0, this.maxIndex)
      .llen(this.id)
      .exec(function(err, results) {
        if (err) {
          return callback(err);
        }

        return callback(null, results[2]);
    });
  }
}

export default RedisCappedList;
