//
// a series of post utility methods that were
// part of the original deno import scripts but
// haven't been ported to the webapp
import fs from "fs";
import BetterSqlite3 from "better-sqlite3";

import nanoid from "nanoid";

import { DB_PATH } from "../consts";
type Post = {
  id: string;
  user_id: string;
  media: string;
  title: string;
  caption: string;
  created_on: string | undefined;
  published_on: string | undefined;
  deleted_on: string | undefined;
  metadata: {}; // unused for now!
  hashtags: string[];
  mentions: string[];
};

let db: BetterSqlite3.Database = new BetterSqlite3(DB_PATH);
db.pragma("journal_mode = WAL");

const postInsertQuery = db.prepare<{
  id: string;
  title: string;
  media: string;
  user: string;
  created_on: number | null;
  published_on: number | null;
  hashtags: string;
  mentions: string;
}>(
  `INSERT INTO posts 
    (id, title, media, user_id, created_on, published_on, hashtags, mentions) 
    values 
    (:id, :title, :media, :user_id, :created_on, :published_on, :hashtags, :mentions)`
);

// stored queries for adding hashtags
const hashtagInsertQuery = db.prepare<{ id: string; name: string }>(
  "INSERT into hashtags (id, name) values (:id, :name)"
);

const hashtagSearchQuery = db.prepare<{ name: string }>(
  "SELECT * from hashtags where name = :name"
);

const getHashtagForName = (name: string) =>
  hashtagSearchQuery.get<{ id: string; name: string; description: string }>({
    name,
  });

const addHashTag = (name: string, id: string) =>
  hashtagInsertQuery.run({ name, id });

const mentionInsertQuery = db.prepare<{ id: string; username: string }>(
  "INSERT into users (id, username) values (:id, :username)"
);

const addPost = (
  user: { id: string },
  post: Post,
  media: string[], // a list of media ids
  hashtags: string[], // the actual names,
  created_on?: Date,
  published_on?: Date
) => {
  const id = nanoid.nanoid(5);
  const { title } = post;
  const postHashtags = [...new Set([...findHashtags(title), ...hashtags])].map(
    selectOrAddHashtag
  );
  const postMentions = [...new Set(findMentions(title))];

  const params = {
    id,
    title: title,
    media,
    user_id: user.id,
    created_on: post.creation_timestamp ?? +new Date(),
    hashtags: postHashtags,
    mentions: postMentions,
  };
  postInsertQuery.run({
    ...params,
    published_on: post.creation_timestamp ?? null,
    media: JSON.stringify(params.media),
    hashtags: JSON.stringify(params.hashtags.map((i) => i.id)),
    mentions: JSON.stringify(params.mentions),
  });
  return params;
};

const selectOrAddHashtag = (name: string): Hashtag => {
  const tag = getHashtagForName(name);
  if (tag) {
    return tag;
  } else {
    const id = nanoid.nanoid(5);
    const params = { id, name };
    hashtagInsertQuery.execute(params);
    return { ...params, description: null };
  }
};

hashtagInsertQuery.then((q) => q.run);

/*.prepareQuery<[], Record<string, unknown>, { id: string; name: string }>(
    "INSERT into hashtags (id, name) values (:id, :name)"
  );*/

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
