'use strict';

import pk = require("../package.json");
import main from './main';
import serverMod from './server';
import restifyErrors from 'restify-errors';

// Use New Relic if LICENSE_KEY has been specified.
if (process.env.NEW_RELIC_LICENSE_KEY) {
  if (!process.env.NEW_RELIC_APP_NAME) {
    process.env.NEW_RELIC_APP_NAME = pk.api;
  }
  require('newrelic');
}

import cluster from 'cluster';
import log from './log';
import config from './config';

if (cluster.isMaster) {

  // master
  log.info('starting up...', {env: process.env, config: config});
  cluster.fork();
  cluster.fork();
  cluster.on('disconnect', function (/*worker*/) {
    log.error('disconnect!');
    cluster.fork();
  });
}
else {

  // Create http server
  const server = serverMod();

  // Intitialize backend, add routes
  main(config.routePrefix, server);

  // Handle uncaughtException, kill the worker
  server.on('uncaughtException', function (req, res, route, err) {

    // Log the error
    log.error(err);

    // Note: we're in dangerous territory!
    // By definition, something unexpected occurred,
    // which we probably didn't want.
    // Anything can happen now!  Be very careful!
    try {
      // make sure we close down within 30 seconds
      setTimeout(function () {
        process.exit(1);
      }, 30000);

      // stop taking new requests
      server.close();

      // Let the master know we're dead.  This will trigger a
      // 'disconnect' in the cluster master, and then it will fork
      // a new worker.
      cluster.worker.disconnect();

      const InternalError = restifyErrors.InternalError;
      res.send(new InternalError(err, err.message || 'unexpected error'));
    }
    catch (err2) {
      log.error('Error sending 500!');
      log.error(err2);
    }
  });

  // Start the server
  server.listen(config.port, function () {
    log.info(server.name + ' listening at ' + server.url);
  });
}
