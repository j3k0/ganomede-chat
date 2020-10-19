// About

import * as os from "os";
import pk = require("../package.json");
import { Server } from "restify";

const about = {
  hostname: os.hostname(),
  type: pk.name,
  version: pk.version,
  description: pk.description,
  startDate: (new Date).toISOString()
};

const sendAbout = function(req, res, next) {
  res.send(about);
  return next();
};

const addRoutes = function(prefix: string, server: Server) {
  server.get("/about", sendAbout);
  return server.get(`/${prefix}/about`, sendAbout);
};

export default {addRoutes};

// vim: ts=2:sw=2:et: