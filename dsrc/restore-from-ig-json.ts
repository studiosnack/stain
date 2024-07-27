import { DB } from "https://deno.land/x/sqlite@v3.2.1/mod.ts";
import { nanoid } from "https://deno.land/x/nanoid@v3.0.0/mod.ts";
import { customAlphabet } from "https://deno.land/x/nanoid/customAlphabet.ts";
import { join, basename } from "https://deno.land/std@0.193.0/path/mod.ts";

// import sharp from "https://cdn.skypack.dev/sharp";

const DB_FILE = "../insta.db";
const BOOTSTRAP_SQL = "../sql/bootstrap.sql";
const ARCHIVE_ROOT = "../archives/nsfmc_20230203";
const MEDIA_ROOT = "../media";

const db = new DB(DB_FILE);

console.log("dropping tables...");

db.query("DROP TABLE if exists file_meta;");
db.query("DROP TABLE if exists media; ");
db.query("DROP TABLE if exists posts");
db.query("DROP TABLE if exists hashtags;");
db.query("DROP TABLE if exists passkeys;");
db.query("DROP TABLE if exists invites;");
db.query("DROP TABLE if exists users;");

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
  enabled = false,
  referenced_by: string | null = null
): User => {
  const myUid = nanoid(5);
  // console.log(`adding user ${username} (${myUid})...`);

  const userParams = { id: myUid, username, name, enabled, referenced_by };

  db.query(
    "INSERT INTO USERS (id, username, name, enabled, referenced_by) values (:id, :username, :name, :enabled, :referenced_by)",
    userParams
  );
  return userParams;
};

// if you call this with no arguments, it generates
// a base invite
const makeInvite = (
  invitee_id: string | null = null, // the id of the person invited
  inviter_id: string | null = null // the id of the person who invited the invitee
) => {
  const nanoInviteId = customAlphabet(
    "6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz",
    5
  );
  const inviteId = `${nanoInviteId()}-${nanoInviteId()}`;
  const params = {
    recipient_id: invitee_id,
    sender_id: inviter_id,
    code: inviteId,
  };

  db.query(
    "INSERT INTO INVITES (recipient_id, sender_id, code) VALUES (:recipient_id, :sender_id, :code)",
    params
  );
  return params;
};

const me = addUser("nsfmc", "marcos ojeda", true);
const invite = makeInvite(me.id);
console.log(`made an invite for ${me.username} with code ${invite.code}`);

// instagram serializes lat/lon as just two floats rather than as its constituent bits
type IGGPSExif = { latitude: number; longitude: number };

type IGExif = {
  iso: number; // i.e. 8000
  focal_length: string; // "5.6"
  lens_model: string; // "E 35mm F1.8 OSS"
  scene_capture_type: string; // "standard"
  software: string; // camera software, like ILCE-7M4 V1.00
  device_id: string; // uuid, possibly phone device id
  scene_type: number; // "1?"
  camera_position: string; // "unknown" or "back"
  lens_make: string; // "apple"
  date_time_digitized: string; // iso 8601
  date_time_original: string;
  source_type: string; // library | camera???
  aperture: string; // floatish
  shutter_speed: string; // floatish
  metering_mode: string; // number-like string
};

type IGMedia = {
  uri: string;
  creation_timestamp: number;
  title: string;
  media_metadata?: {
    photo_metadata?: {
      exif_data?: Array<IGGPSExif | IGExif>;
    };
  };
};
type IGPost = {
  media: IGMedia[];
  title?: string;
  creation_timestamp?: number;
};
type IGPosts = IGPost[];

function transcodeLatin1ToUtf8(l1str) {
  const bytes = Uint8Array.from([...l1str].map((c) => c.charCodeAt(0)));
  return new TextDecoder().decode(bytes);
}

const { default: jsonData }: IGPosts = await import(
  `${ARCHIVE_ROOT}/content/posts_1.json`,
  {
    assert: { type: "json" },
  }
);
// console.log(jsonData)
// const jsonData: IGPosts = JSON.parse(
//   await Deno.readTextFile(`${ARCHIVE_ROOT}/content/posts_1.json`)
// );

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
    user_id: string;
    uri: string;
    title: string;
    metadata: string;
    created_on: number;
    hashtags: string;
    mentions: string;
  }
>(
  `INSERT INTO media
    (id, user_id, uri, title, metadata, created_on, hashtags, mentions, source)
    values
    (:id, :user_id, :uri, :title, :metadata, :created_on, :hashtags, :mentions, 'instagram')`
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
    published_on: number | null;
    hashtags: string;
    mentions: string;
  }
>(
  "INSERT INTO posts (id, title, media, user_id, created_on, published_on, hashtags, mentions) values (:id, :title, :media, :user_id, :created_on, :published_on, :hashtags, :mentions)"
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

    // create a tentative invite for each ref'd user
    const addedMention = addUser(username, undefined, false, me.id);
    // console.log(`adding found user ${username} (${id})`)
    // const invite = makeInvite(addedMention.id, me.id);
    return { ...params, name: "" };
  }
  return tag[0];
};

const pathToMedia = (uri: string) => join(ARCHIVE_ROOT, uri);

const relativePathToImportedMedia = (name: string = "") =>
  join("o", "imported", name);
const pathToImportedMediaRoot = (name: string = "") =>
  join(MEDIA_ROOT, relativePathToImportedMedia(name));

const addMedia = (media: IGMedia) => {
  const id = nanoid(6);
  const title = transcodeLatin1ToUtf8(media.title);
  const mediaHashtags = [...new Set(findHashtags(title))].map(
    selectOrAddHashtag
  );
  const mediaMentions = [...new Set(findMentions(title))].map(
    selectOrAddMention
  );

  const params = {
    id,
    user_id: me.id,
    uri: media.uri,
    title: title,
    metadata: media.media_metadata,
    created_on: media.creation_timestamp,
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
  const title = transcodeLatin1ToUtf8(post?.title ?? "");
  const postHashtags = [...new Set([...findHashtags(title), ...hashtags])].map(
    selectOrAddHashtag
  );
  const postMentions = [...new Set(findMentions(title))];

  const params = {
    id,
    title: title,
    media,
    user_id: user.id,
    created_on: post.creation_timestamp ?? null,
    hashtags: postHashtags,
    mentions: postMentions,
  };
  postInsertQuery.execute({
    ...params,
    published_on: post.creation_timestamp ?? null,
    media: JSON.stringify(params.media),
    hashtags: JSON.stringify(params.hashtags.map((i) => i.id)),
    mentions: JSON.stringify(params.mentions),
  });
  return params;
};

console.log("adding media in a transaction");

const hashtagRe = new RegExp(/#(?<hashtag>\w+)/, "g");
const mentionRe = new RegExp(/@(?<user>\w+)/, "g");

const findRes = (str: string, re: RegExp): string[] => {
  if (str.trim() === "") {
    return [];
  }
  const foundMatches = [...(str.matchAll(re) ?? [])];

  return foundMatches.map((m) => m[1]);
};

const findHashtags = (str: string): string[] => findRes(str, hashtagRe);
const findMentions = (str: string): string[] => findRes(str, mentionRe);

console.log("emptying imported media root");
await Deno.remove(pathToImportedMediaRoot(""), { recursive: true });
await Deno.mkdir(pathToImportedMediaRoot(""), { recursive: true });

db.transaction(() => {
  for (const post of jsonData) {
    if (post.media.length === 0) {
      break;
    }

    const creationDate = post.media[0].creation_timestamp;
    post.creation_timestamp = post.creation_timestamp
      ? post.creation_timestamp
      : creationDate;

    let hashtags: string[] = [];
    let mentions: string[] = [];
    if (post.title) {
      hashtags = findHashtags(post.title);
      mentions = findMentions(post.title);
    }

    const media = [];
    for (const medium of post.media) {
      const srcName = basename(medium.uri);
      const dest = pathToImportedMediaRoot(srcName);
      Deno.copyFileSync(pathToMedia(medium.uri), dest);
      medium.uri = relativePathToImportedMedia(srcName);

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
