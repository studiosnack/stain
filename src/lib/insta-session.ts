/**
 *  an better-sqlite3 backed session store
 */
import { SessionData, Store } from "express-session";
import { type Database } from "better-sqlite3";

const noop = (_err?: unknown, _data?: any) => {};

export class InstaSessionStore extends Store {
  db: Database;
  sessionTableName: string;

  constructor(db: Database, sessionTableName: string = "__sessions") {
    super();
    this.db = db;
    this.sessionTableName = sessionTableName;
    this._initDb();
  }

  _initDb() {
    this.db;
    let res;
    try {
      res = this.db.exec(`CREATE TABLE IF NOT EXISTS
        ${this.sessionTableName} (
          id TEXT PRIMARY KEY,
          data TEXT default '{}'
        )`);
    } catch (err) {
      console.error(err);
    }
  }

  get(sessionId: string, cb = noop) {
    let session;
    try {
      session = this.db
        .prepare<{ id: string }, { id: string; data: string }>(
          `SELECT id, data FROM ${this.sessionTableName} WHERE id = $id`
        )
        .get({ id: sessionId });
    } catch (err) {
      return cb(err);
    }
    if (session != null) {
      return cb(null, JSON.parse(session.data));
    }
    return cb(null, null);
  }

  async set(sessionId: string, session: SessionData, cb = noop) {
    let res;
    try {
      res = this.db
        .prepare(
          `INSERT INTO ${this.sessionTableName}
        (id, data)
        VALUES
        ($id, $data)
        ON CONFLICT (id) DO UPDATE set data = $data`
        )
        .run({
          id: sessionId,
          data: JSON.stringify(session),
        });
      console.log(`[session] inserting a row with id: ${sessionId}, `, res);
    } catch (err) {
      return cb(err);
    }
    return cb();
  }

  async destroy(sessionId: string, cb = noop) {
    let res;
    try {
      res = this.db
        .prepare(
          `DELETE from
        ${this.sessionTableName}
        WHERE
        id = $id`
        )
        .run({ id: sessionId });
    } catch (err) {
      return cb(err);
    }
    return cb(null);
  }
}
