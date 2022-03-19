import { DB } from "https://deno.land/x/sqlite@v3.2.1/mod.ts";
import { nanoid } from "https://deno.land/x/nanoid@v3.0.0/mod.ts";
// import sharp from "https://cdn.skypack.dev/sharp";

const DB_FILE = "../insta.db";
const BOOTSTRAP_SQL = "../sql/bootstrap.sql";
const ARCHIVE_ROOT = "../archives/nsfmc_20211226";

const db = new DB(DB_FILE);

console.log("dropping tables...");

db.query("DROP TABLE if exists media; ");
db.query("DROP TABLE if exists posts");
db.query("DROP TABLE if exists users;");
db.query("DROP TABLE if exists hashtags;");

console.log("creating tables from bootstrap file...");

const bootQuery = await Deno.open(BOOTSTRAP_SQL, {
  read: true,
  write: false,
});

const dbres = Deno.run({
  cmd: ["sqlite3", DB_FILE],
  stdin: bootQuery.rid,
});

await dbres.status();

type User = {
  id: string;
  username: string;
  name: string | null;
  enabled?: boolean;
};

const addUser = (
  username: string,
  name: string | null = null,
  enabled = false
): User => {
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
const _formatter = new Intl.DateTimeFormat("en-US", {
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
    hashtags: string;
    mentions: string;
  }
>(
  "INSERT INTO media (id, uri, title, metadata, created_on, hashtags, mentions) values (:id, :uri, :title, :metadata, :created_on, :hashtags, :mentions)"
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
    hashtags: string;
    mentions: string;
  }
>(
  "INSERT INTO posts (id, title, media, user, created_on, hashtags, mentions) values (:id, :title, :media, :user, :created_on, :hashtags, :mentions)"
);

type Hashtag = {
  id: string;
  name: string;
  description: string | null;
};
const hashtagSearchQuery = db.prepareQuery<
  Hashtag[],
  Hashtag,
  { name: string }
>("SELECT * from hashtags where name = :name");

const mentionSearchQuery = db.prepareQuery<User[], User, { username: string }>(
  "SELECT * from users where username = :username"
);

const hashtagInsertQuery = db.prepareQuery<
  [],
  Record<string, unknown>,
  { id: string; name: string }
>("INSERT into hashtags (id, name) values (:id, :name)");

const mentionInsertQuery = db.prepareQuery<
  [],
  Record<string, unknown>,
  { id: string; username: string }
>("INSERT into users (id, username) values (:id, :username)");

const selectOrAddHashtag = (name: string): Hashtag => {
  const tag = hashtagSearchQuery.allEntries({ name });
  if (tag.length === 0) {
    const id = nanoid(5);
    const params = { id, name };
    hashtagInsertQuery.execute(params);
    return { ...params, description: null };
  }
  return tag[0];
};
const selectOrAddMention = (username: string): User => {
  const tag = mentionSearchQuery.allEntries({ username });
  if (tag.length === 0) {
    const id = nanoid(5);
    const params = { id, username };
    mentionInsertQuery.execute(params);
    return { ...params, name: "" };
  }
  return tag[0];
};

const addMedia = (media: IGMedia) => {
  const id = nanoid(6);
  const mediaHashtags = [...new Set(findHashtags(media.title))].map(
    selectOrAddHashtag
  );
  const mediaMentions = [...new Set(findMentions(media.title))].map(
    selectOrAddMention
  );

  console.log(`trying to open ${ARCHIVE_ROOT + "/" + media.uri}`);
  //const buf = Deno.readFileSync(media.uri);
  // @ts-ignore: bad type def
  //const meta = sharp(buf).metadata();
  //console.log(meta);

  const params = {
    id,
    uri: media.uri,
    title: media.title,
    metadata: media.media_metadata,
    created_on: media.creation_timestamp * 1000,
    hashtags: mediaHashtags,
    mentions: mediaMentions,
  };
  mediaInsertQuery.execute({
    ...params,
    metadata: JSON.stringify(params.metadata ?? {}),
    hashtags: JSON.stringify(params.hashtags.map((i) => i.id)),
    mentions: JSON.stringify(params.mentions.map((i) => i.id)),
  });
  return params;
};

const addPost = (
  user: { id: string },
  post: IGPost,
  media: string[],
  hashtags: string[]
) => {
  const id = nanoid(5);
  const postHashtags = [
    ...new Set([...findHashtags(post?.title ?? ""), ...hashtags]),
  ].map(selectOrAddHashtag);
  const postMentions = [...new Set(findMentions(post?.title ?? ""))];

  const params = {
    id,
    title: post.title ?? "",
    media,
    user: user.id,
    created_on: post.creation_timestamp ?? null,
    hashtags: postHashtags,
    mentions: postMentions,
  };
  postInsertQuery.execute({
    ...params,
    media: JSON.stringify(params.media),
    hashtags: JSON.stringify(params.hashtags.map((i) => i.id)),
    mentions: JSON.stringify(params.mentions),
  });
  return params;
};

console.log("adding media in a transaction");

const hashtagRe = new RegExp(/#(?<hashtag>\w+)/, "g");
const mentionRe = new RegExp(/@(?<user>\w+)/, "g");

// type MatchResult = { [key: string]: string } | undefined;

const findRes = (str: string, re: RegExp): string[] => {
  if (str.trim() === "") {
    return [];
  }
  const foundMatches = [...(str.matchAll(re) ?? [])];

  return foundMatches.map((m) => m[1]);
};

const findHashtags = (str: string): string[] => findRes(str, hashtagRe);
const findMentions = (str: string): string[] => findRes(str, mentionRe);

db.transaction(() => {
  for (const post of jsonData) {
    if (post.media.length === 0) {
      break;
    }

    const creationDate = post.media[0].creation_timestamp * 1000;
    post.creation_timestamp = post.creation_timestamp
      ? post.creation_timestamp * 1000
      : creationDate;

    let hashtags: string[] = [];
    let mentions: string[] = [];
    if (post.title) {
      hashtags = findHashtags(post.title);
      mentions = findMentions(post.title);
    }

    const media = [];
    for (const medium of post.media) {
      const added = addMedia(medium);
      hashtags = [...hashtags, ...added.hashtags.map((x: Hashtag) => x.name)];
      mentions = [...mentions, ...added.mentions.map((x) => x.username)];
      media.push(added.id);
    }

    addPost(me, post, media, hashtags);
  }
});
console.log("finished creating media");

mediaInsertQuery.finalize();
postInsertQuery.finalize();

console.log(`\nall done!`);
