import Database from "better-sqlite3";

import * as fsSync from "node:fs";

import {
  DB_PATH,
} from "./consts";

  // bootstrap tables if db path doesn't exist
export const runBootstrap = DB_PATH != null && !fsSync.existsSync(DB_PATH);

let db = Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma('busy_timeout = 5000');
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

export default db;
