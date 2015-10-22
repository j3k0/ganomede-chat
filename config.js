var pkg = require('./package.json');

module.exports = {
  pkg: pkg,
  port: +process.env.PORT || 8000,
  routePrefix: process.env.ROUTE_PREFIX || pkg.api,
  debug: process.env.NODE_ENV !== 'production',
  secret: process.env.API_SECRET,

  authdb: {
    host: process.env.REDIS_AUTH_PORT_6379_TCP_ADDR || 'localhost',
    port: +process.env.REDIS_AUTH_PORT_6379_TCP_PORT || 6379
  },

  redis: {
    host: process.env.REDIS_CHAT_PORT_6379_TCP_ADDR || 'localhost',
    port: +process.env.REDIS_CHAT_PORT_6379_TCP_PORT || 6379,
    maxRoomMessages: +process.env.MAX_MESSAGES || 100
  }
};
