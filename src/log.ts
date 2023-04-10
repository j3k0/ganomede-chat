import bunyan from "bunyan";
import Logger from "bunyan";

const log:Logger = bunyan.createLogger({name: "chat"});

export default log;
// vim: ts=2:sw=2:et:
