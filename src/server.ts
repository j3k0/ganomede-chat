/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import restify from 'restify';
import log from './log';
import pkg from '../package.json';

export default function(options) {
  if (options == null) { options = {}; }
  const server = restify.createServer({
    handleUncaughtExceptions: true,
    log
  });

  server.use(restify.queryParser());
  server.use(restify.bodyParser());
  server.use(restify.gzipResponse());

  const shouldLogRequest = req => req.url.indexOf(`/${pkg.api}/ping/_health_check`) < 0;

  const shouldLogResponse = res => res && (res.statusCode >= 500);

  const filteredLogger = function(errorsOnly, logger) {
    let logger_mw;
    return logger_mw = function(req, res, next) {
      const logError = errorsOnly && shouldLogResponse(res);
      const logInfo = !errorsOnly && (
        shouldLogRequest(req) || shouldLogResponse(res));
      if (logError || logInfo) {
        logger(req, res);
      }
      if (next && (typeof next === 'function')) {
        return next();
      }
    };
  };

  // Log incoming requests
  const requestLogger = filteredLogger(false, req => req.log.info({req_id: req.id()}, `${req.method} ${req.url}`));
  server.use(requestLogger);

  // Audit requests at completion
  server.on('after', filteredLogger(process.env.NODE_ENV === 'production',
    restify.auditLogger({log, body: true})));

  // Automatically add a request-id to the response
  const setRequestId = function(req, res, next) {
    res.setHeader('x-request-id', req.id());
    req.log = req.log.child({req_id: req.id()});
    return next();
  };
  server.use(setRequestId);

  // Send audit statistics
  const sendAuditStats = require('./send-audit-stats');
  server.on('after', sendAuditStats);

  return server;
};
