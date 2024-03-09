import {SessionData, Store} from 'express-session';
import {Database} from 'sqlite';

const noop = (_err?: unknown, _data?: any) => {};

export class InstaSessionStore extends Store {
  db: Database;
  sessionTableName: string;

  constructor(db: Database, sessionTableName: string = '__sessions') {
    super();
    this.db = db;
    this.sessionTableName = sessionTableName;
    this._initDb();
  }

  async _initDb() {
    await this.db;
    let res;
    try {
      res = await this.db.exec(`CREATE TABLE IF NOT EXISTS
        ${this.sessionTableName} (
          id TEXT PRIMARY KEY,
          data TEXT default '{}'
        )`)
    } catch(err) {
      console.error(err)
    }
  }

  async get(sessionId: string, cb = noop) {
    let session;
    try{
      session = await this.db.get(
      `SELECT id, data FROM ${this.sessionTableName} WHERE id = $id`,
      {$id: sessionId},
    )
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
      res = await this.db.get(`INSERT INTO ${this.sessionTableName}
        (id, data)
        VALUES
        ($id, $data)
        ON CONFLICT (id) DO UPDATE set data = $data`, {
          $id: sessionId,
          $data: JSON.stringify(session),
        });
      console.log(`inserting a row with id: ${sessionId}, `, res)
    } catch (err) {
      return cb(err);
    }
    return cb()
  }

  async destroy(sessionId: string, cb = noop) {
    let res;
    try {
      res = await this.db.get(`DELETE from
        ${this.sessionTableName}
        WHERE
        id = $id`, {$id: sessionId})
    } catch (err) {
      return cb(err);
    }
    return cb(null)
  }

}
