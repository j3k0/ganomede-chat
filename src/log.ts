import bunyan from "bunyan";
import Logger from "bunyan";

const log:Logger = bunyan.createLogger({name: "notifications"});

export default log;
// vim: ts=2:sw=2:et:
