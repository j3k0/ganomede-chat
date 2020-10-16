/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const parseJson = JSON.parse.bind(JSON);

class RedisCappedList {
  constructor(options) {
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

  items(callback) {
    return this.redis.lrange(this.id, 0, -1, function(err, items) {
      if (err) {
        return callback(err);
      }

      return callback(null, items.map(parseJson));
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
