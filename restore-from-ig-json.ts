import { DB } from "https://deno.land/x/sqlite@v3.2.1/mod.ts";
import { nanoid } from "https://deno.land/x/nanoid@v3.0.0/mod.ts";

const DB_FILE = "./insta.db";
const ARCHIVE_ROOT = "archives/nsfmc_20211226";

const db = new DB(DB_FILE);

console.log("dropping tables...");

db.query("DROP TABLE if exists media; ");
db.query("DROP TABLE if exists posts");
db.query("DROP TABLE if exists users;");
db.query("DROP TABLE if exists hashtags;");

console.log("creating tables from bootstrap file...");

const bootQuery = await Deno.open("./bootstrap.sql", {
  read: true,
  write: false,
});

const dbres = Deno.run({
  cmd: ["sqlite3", DB_FILE],
  stdin: bootQuery.rid,
});

await dbres.status();

const addUser = (
  username: string,
  name: string | null = null,
  enabled = false
) => {
  const myUid = nanoid();
  console.log(`adding user (${myUid})...`);

  const userParams = { id: myUid, username, name, enabled };

  db.query(
    "INSERT INTO USERS (id, username, name, enabled) values (:id, :username, :name, :enabled)",
    userParams
  );
  return userParams;
};

const me = addUser("nsfmc", "marcos ojeda", true);

type LocationExif = { latitude: number; longitude: number };
type CameraExif = {
  iso: number;
  focal_length: string;
  lens_model: string;
  scene_capture_type: string;
  software: string;
  device_id: string;
  scene_type: number;
  camera_position: string;
  lens_make: string;
  date_time_digitized: string; // iso 8601
  date_time_original: string;
  source_type: string; // library | camera???
  aperture: string; // floatish
  shutter_speed: string; // floatish
  metering_mode: string; // number?
};

type IGMedia = {
  uri: string;
  creation_timestamp: number;
  title: string;
  media_metadata?: {
    photo_metadata?: {
      exif_data?: Array<LocationExif | CameraExif>;
    };
  };
};
type IGPost = {
  media: IGMedia[];
  title?: string;
  creation_timestamp?: number;
};
type IGPosts = IGPost[];

const jsonData: IGPosts = JSON.parse(
  await Deno.readTextFile(`${ARCHIVE_ROOT}/content/posts_1.json`)
);

jsonData.sort((left, right) => {
  return (
    left.media?.[0].creation_timestamp - right.media?.[0].creation_timestamp
  );
});

console.log(`found ${jsonData.length} posts`);
let formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
});

const mediaInsertQuery = db.prepareQuery<
  [],
  Record<string, unknown>,
  {
    id: string;
    uri: string;
    title: string;
    metadata: string;
    created_on: number;
  }
>(
  "INSERT INTO media (id, uri, title, metadata, created_on) values (:id, :uri, :title, :metadata, :created_on)"
);
const postInsertQuery = db.prepareQuery<
  [],
  Record<string, unknown>,
  {
    id: string;
    title: string;
    media: string;
    user: string;
    created_on: number | null;
  }
>(
  "INSERT INTO posts (id, title, media, user, created_on) values (:id, :title, :media, :user, :created_on)"
);

const addMedia = (media: IGMedia) => {
  const id = nanoid(6);
  const params = {
    id,
    uri: media.uri,
    title: media.title,
    metadata: JSON.stringify(media.media_metadata),
    created_on: media.creation_timestamp * 1000,
  };
  mediaInsertQuery.execute(params);
  return params;
};

const addPost = (user: { id: string }, post: IGPost, media: string[]) => {
  const id = nanoid(5);
  const params = {
    id,
    title: post.title ?? "",
    media: JSON.stringify(media),
    user: user.id,
    created_on: post.creation_timestamp ?? null,
  };
  postInsertQuery.execute(params);
  return params;
};

console.log("adding media in a transaction");

db.transaction(() => {
  for (const post of jsonData) {
    if (post.media.length === 0) {
      break;
    }

    const creationDate = post.media[0].creation_timestamp * 1000;
    post.creation_timestamp = post.creation_timestamp
      ? post.creation_timestamp * 1000
      : creationDate;

    const media = [];
    for (const medium of post.media) {
      const added = addMedia(medium);
      media.push(added.id);
    }
    addPost(me, post, media);
  }
});
console.log("finished creating media");

mediaInsertQuery.finalize();
postInsertQuery.finalize();

console.log(`\nall done!`);
