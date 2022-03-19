import Database from "better-sqlite3";

const DB_PATH = "../insta.db";

// this is a top-level await
// open the database

type RawMediaType = {
  id: string;
  url: string;
  title?: string;
  caption?: string;
  created_on: string;
  deleted_on?: string;
  metadata: string;
  hashtags: string;
  mentions: string;
};

const db = new Database(DB_PATH);
const statement = db.prepare("select * from media");
const media = statement.all<RawMediaType>();

for (const thing of media) {
  console.log(thing);
}
