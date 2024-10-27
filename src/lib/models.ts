// import { Database } from "sqlite";
import { type Database } from "better-sqlite3";

import nanoid from "nanoid";
// for image metadata
import sharp from "sharp";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import exifReader from "exif-reader";

const METADATA_VERSION = 5;

export type User = {
  id: string;
  username: string;
  name: string;
  bio: string;
  url: string;
  enabled: boolean;
  passkey_id: Buffer;
  referenced_by: string | null;
};

export function getInvitableUsers(db: Database, currentUserId: string): User[] {
  return db
    .prepare<{ currentUserId: string }, User>(
      `select * from users where enabled is true and id != :currentUserId`
    )
    .all({ currentUserId: currentUserId });
}

export function getReferencedUsers(
  db: Database,
  currentUserId: string
): User[] {
  return db
    .prepare<{ currentUserId: string }, User>(
      `select * from users where enabled is false and referenced_by = :currentUserId`
    )
    .all({ currentUserId });
}

export function getUserByName(
  db: Database,
  username: string
): User | undefined {
  return db
    .prepare<{ username: string }, User>(
      `SELECT * from users where username = $username`
    )
    .get({
      username,
    });
}

export function getUserById(db: Database, userId: string): User | undefined {
  return db
    .prepare<{ userId: string }, User>(`SELECT * from users where id = $userId`)
    .get({
      userId,
    });
}

export function insertNewUser(
  db: Database,
  username: string,
  name: string = "",
  invitingUserId: string | null
): User | undefined {
  const userId = nanoid.nanoid(5);
  db.prepare(
    "INSERT INTO users (id, username, name, enabled, referenced_by) values (:id, :username, :name, :enabled, :referenced_by)"
  ).run({
    id: userId,
    username: username,
    name: name,
    enabled: true,
    referenced_by: invitingUserId,
  });
  return getUserById(db, userId);
}

export type InvitedUser = {
  id: string;
  username: string;
  name: string;
  code: string;
  activated_on: number;
};

export function selectInvitedUsers(
  db: Database,
  invitingUser: string
): InvitedUser[] {
  return db
    .prepare<{ invitingUser: string }, InvitedUser>(
      `SELECT 
      users.id as id, 
      users.username as username, 
      users.name as name,
      invites.code as code, 
      invites.activated_on as activated_on 
    FROM invites 
    LEFT JOIN users 
    ON users.id = invites.recipient_id
    WHERE sender_id = :invitingUser`
    )
    .all({ invitingUser });
}

export function updateUsername(
  db: Database,
  userId: string,
  newUsername: string
): User | undefined {
  try {
    db.prepare(
      "UPDATE users set username = :newUsername where id = :userId"
    ).run({
      newUsername,
      userId,
    });
    return getUserById(db, userId);
  } catch (err) {
    console.log("ooops");
    console.error(err);
  }
}

export function updateName(
  db: Database,
  userId: string,
  newName: string
): User | undefined {
  try {
    db.prepare("UPDATE users set name = :newName where id = :userId").run({
      newName,
      userId,
    });
    return getUserById(db, userId);
  } catch (err) {
    console.log("ooops");
    console.error(err);
  }
}

type Invite = {
  id: number;
  recipient_id: string;
  sender_id: string | null;
  code: string;
  created_on: string;
  activated_on: string | null;
  expires_on: string | null;
  deleted_on: string | null;
};

const nanoInviteId = nanoid.customAlphabet(
  "6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz",
  5
);

export function createInviteForUser(
  db: Database,
  recipientId: string,
  senderId: string
): Invite | undefined {
  const code = `${nanoInviteId()}-${nanoInviteId()}`;
  db.prepare(
    `
    INSERT INTO invites (
      recipient_id, 
      sender_id, 
      code
    ) VALUES (
      :recipient_id, 
      :sender_id, 
      :code
    )`
  ).run({ recipient_id: recipientId, ":sender_id": senderId, code });
  return db
    .prepare<{ code: string }, Invite>(
      `select * from invites where code = :code`
    )
    .get({ code });
}

// type RawMediaType = {
//   id: string;
//   uri: string;
//   title?: string;
//   caption?: string;
//   created_on: string;
//   deleted_on?: string;
//   metadata: string;
//   hashtags: string;
//   mentions: string;
// };

export type Media = {
  id: string;
  uri: string; // a relative path
  user_id: string;
  title?: string;
  caption?: string;
  created_on: number;
  deleted_on?: number;
  metadata: { [key: string]: any };
  hashtags: string[];
  mentions: string[];
};

export function getMediaById(db: Database, id: string): Media | undefined {
  // TODO(marcos): parse created_on/deleted_on as dates * 1000
  return db
    .prepare<{ media_id: string }, Media>(
      "select * from media where id = :media_id"
    )
    .get({
      media_id: id,
    });
}

// export const parseMedia = (media: RawMediaType): Media => {
//   return {
//     ...media,
//     created_on: new Date(Number(media.created_on)),
//     deleted_on: media.deleted_on
//       ? new Date(Number(media.deleted_on))
//       : undefined,
//     metadata: JSON.parse(media.metadata),
//     hashtags: JSON.parse(media.hashtags),
//     mentions: JSON.parse(media.mentions),
//   };
// };

// // not sure what this was for, maybe for exif parsing???
// //
// export const degToDMS = (degrees: number): [number,number,number] => {
//   const d = parseInt(degrees, 10);
//   const dm = degrees - d;
//   const ms = dm*60
//   const m = parseInt(ms, 10);
//   const s = (ms - m) * 60
//   return [d,m,s]
// }

type InviteData = {
  code: Invite["code"];
  recipient_username: User["username"];
  passkey_id: Passkey["id"];
  sender_username: User["username"];
  sender_name: User["name"];
  activated_on?: string;
  deleted_on?: string;
  expires_on?: string;
};

export function inviteDataFromCode(
  db: Database,
  code: string
): InviteData | undefined {
  return db
    .prepare<{ code: string }, InviteData>(
      `
    SELECT
      invites.code AS code,
      recipients.username AS recipient_username,
      recipients.name AS recipient_name,
      recipients.passkey_id AS passkey_id,
      IFNULL(senders.username, 'system') AS sender_username,
      senders.name AS sender_name,
      invites.activated_on AS activated_on,
      invites.deleted_on AS deleted_on,
      invites.expires_on AS expires_on
    FROM invites
      LEFT JOIN users recipients ON recipients.id = invites.recipient_id
      LEFT JOIN users senders ON senders.id = invites.sender_id
      WHERE code = :code
    `
    )
    .get({ code: code });
}

export function activateInvite(
  db: Database,
  code: string,
  when: string = "now"
) {
  return db
    .prepare<{ code: string; when: string }>(
      `UPDATE invites SET activated_on=strftime('%s', $when) where code = $code;`
    )
    .run({ code: code, when: when });
}

type Passkey = {
  id: Buffer;
  user_id: string;
  public_key_spki: Buffer;
  backed_up: boolean;
};

export function getPasskeyById(db: Database, id: Buffer): Passkey | undefined {
  return db
    .prepare<{ id: Buffer }, Passkey>(`SELECT * FROM passkeys where id = $id`)
    .get({
      id: id,
    });
}

export function insertNewPasskey(db: Database, passkey: Passkey) {
  return db
    .prepare<{
      passkey_id: Passkey["id"];
      username: string;
      public_key_spki: Passkey["public_key_spki"];
      backed_up: Passkey["backed_up"];
    }>(
      `INSERT INTO passkeys (id, user_id, public_key_spki, backed_up) VALUES ($passkey_id, $username, $public_key_spki, $backed_up);`
    )
    .run({
      passkey_id: passkey.id,
      username: passkey.user_id,
      public_key_spki: passkey.public_key_spki,
      backed_up: passkey.backed_up,
    });
}

export function existingCredentialsForUserId(
  db: Database,
  userId: string
): PublicKeyCredentialDescriptor[] {
  let passkeyIds = db
    .prepare<{ userId: string }, PublicKeyCredentialDescriptor>(
      "select id, 'public-key' as type from passkeys where user_id = $userId"
    )
    .all({ userId });
  return passkeyIds;
}

export function getPostForId(db: Database, postId: string): Post | undefined {
  return db
    .prepare<{ id: string }, Post>(`SELECT * from posts where id = :id`)
    .get({ id: postId });
}

export function getPostsByUsername(db: Database, username: string): Post[] {
  return db
    .prepare<{ username: string }, Post>(
      `SELECT *
    FROM posts
    WHERE posts.user_id = (
      SELECT id FROM users WHERE users.username = $username
    )
    ORDER BY posts.created_on DESC`
    )
    .all({ username });
}
type Post = {
  id: string;
  media: Media[];
  title?: string;
  user_id: string;
  creation_timestamp?: number;
};

type PostMedia = {
  post_id: string;
  post_title: string;
  post_created_on: string;
  post_meta: { [key: string]: any };
  post_user_id: string;

  media_id: string;
  m_co: string;
  media_uri: string;
  media_title: string;
  media_caption: string;
  media_meta: {};
};

export function getAllMediaForPost(db: Database, postId: string): PostMedia[] {
  const media = db
    .prepare<{ post_id: string }, PostMedia>(
      `SELECT
    posts.id AS post_id,
    posts.title AS post_title,
    posts.created_on AS post_created_on,
    posts.user_id AS post_user_id,
    posts.metadata AS post_meta,

    mediapost.value AS media_id,

    mediadata.created_on AS m_co,
    mediadata.uri AS media_uri,
    mediadata.title AS media_title,
    mediadata.caption AS media_caption,
    mediadata.metadata AS media_meta

  FROM
    posts,
    json_each(posts.media) AS mediapost
  LEFT JOIN media AS mediadata
    ON media_id = mediadata.id

  WHERE posts.id = :post_id -- and media_id = file_meta.media_id
`
    )
    .all({ post_id: postId });
  return media;
}

function parseMedia(media: { metadata: string }): {} {
  return { ...media, metadata: JSON.parse(media.metadata) };
}

/**
 * parse an image at path with both sharp and exif-reader
 *
 * @param path an absolute path to an image
 */
export async function fileMetaFromPath(path: string) {
  const d = await fs.readFile(path);
  const img = await sharp(d);
  const {
    format,
    size,
    width,
    height,
    space,
    channels,
    depth,
    isProgressive,
    compression,
    resolutionUnit,
    hasProfile,
    hasAlpha,
    orientation,
    exif,
  } = await img.metadata();
  return {
    format,
    size,
    width: (orientation ?? 0) > 5 ? height : width,
    height: (orientation ?? 0) > 5 ? width : height,
    space,
    channels,
    depth,
    isProgressive,
    compression,
    resolutionUnit,
    hasProfile,
    hasAlpha,
    orientation,
    exif: exif ? exifReader(exif) : "none",
  };
}

export async function insertOrFetchMetaFromMediaIdAtPath(
  db: Database,
  mediaId: string,
  path: string
): Promise<{ media_id: string; sharp_metadata: any }> {
  const start = +new Date();
  const savedMeta = db
    .prepare<
      { media_id: string; metadata_version: number },
      { media_id: string; sharp_metadata: string }
    >(
      `
      SELECT media_id, sharp_metadata
      FROM file_meta
      WHERE
        media_id = :media_id
      AND
        metadata_version = :metadata_version`
    )
    .get({
      media_id: mediaId,
      metadata_version: METADATA_VERSION,
    });
  if (savedMeta) {
    console.log(`meta query finished in ${+new Date() - start}ms`);

    const parsedMeta = JSON.parse(savedMeta.sharp_metadata);

    return {
      media_id: mediaId,
      sharp_metadata: parsedMeta,
    };
  }
  console.log(`attempting to load metadata for image at path ${path}`);
  let meta;
  try {
    meta = await fileMetaFromPath(path);
  } catch (err) {
    console.error(`failed to load metadata for image at path ${path}`);
    return { media_id: mediaId, sharp_metadata: {} };
  }
  console.log("parsed image with sharp");
  const res = db
    .prepare<{
      media_id: string;
      sharp_metadata: any;
      metadata_version: number;
    }>(
      `
    INSERT OR IGNORE INTO file_meta
    (media_id, sharp_metadata, metadata_version)
    VALUES
    (:media_id, :sharp_metadata, :metadata_version)
  `
    )
    .run({
      media_id: mediaId,
      sharp_metadata: JSON.stringify(meta),
      metadata_version: METADATA_VERSION,
    });
  console.log(`meta query finished in ${+new Date() - start}ms`);
  return { media_id: mediaId, sharp_metadata: meta };
}

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

/**
  creates a new in-memory media post for a given path
  
  path should be absolute
*/
export function emptyMediaAtPath(path: string): Media {
  return {
    id: nanoid.nanoid(6),
    uri: path,
    title: "",
    caption: "",
    created_on: new Date(),
    metadata: {}, // this is currently instagram metadata, not unpopulated here
    hashtags: [],
    mentions: [],
  };
}

/**
  insert a series of in-memory media objects
  
  if successful returns an array of media ids in the database
 */
export async function insertMediaForUser(
  db: Database,
  media: Media[],
  userId: string,
  root_path: string
): Promise<string[]> {
  const updatedMedia = media.map((m) => {
    const uri = path.relative(root_path, m.uri);
    return { ...m, uri };
  });

  for (const medium of updatedMedia) {
    try {
      let res = db
        .prepare<{
          id: string;
          user_id: string;
          uri: string;
          title: string | void;
          caption: string | void;
        }>(
          `
        INSERT INTO media (
          id, 
          user_id, 
          uri, 
          title, 
          caption,
          source
        ) values (
          :id,
          :user_id,
          :uri,
          :title,
          :caption,
          "stain"
        )
      `
        )
        .run({
          id: medium.id,
          user_id: userId,
          uri: medium.uri,
          title: medium.title,
          caption: medium.caption,
          // TODO(marcos): make created_on variable here (need to find strftime)
        });
    } catch (err) {
      console.error(
        `failed to create media with id: ${medium.id} and path ${medium.uri}`
      );
      console.error(err);
      throw new Error(`failed in inserting media with id ${medium.id}`);
    }
  }
  return updatedMedia.map((m) => m.id);
}

/**
  inserts a new Post, returns the id of the created post
  
  throws if a post fails to insert
 */
export function insertPostForUser(
  db: Database,
  mediaIds: string[],
  userId: string
): string {
  const id = nanoid.nanoid(5);
  const media = JSON.stringify(mediaIds);
  try {
    db.prepare<{ id: string; user_id: string; media: string }>(
      `
      INSERT INTO posts (
        id,
        user_id,
        media,
        title,
        caption
      ) VALUES (
        :id,
        :user_id,
        :media,
        "",
        ""
      )
    `
    ).run({
      id: id,
      user_id: userId,
      media: media,
    });
  } catch (err) {
    console.error(`Failed to create post with id ${id}, with media: ${media}`);
    console.error(err);
  }
  return id;
}

export function updateTitleForPost(
  db: Database,
  postId: string,
  title: string
): string {
  try {
    db.prepare<{ title: string; postId: string }>(
      `
      UPDATE posts SET title = :title where id = :postId
    `
    ).run({
      title,
      postId,
    });
  } catch (err) {
    console.error(`failed to update title of post with id ${postId}`);
    console.error(err);
    throw new Error(`failed to update title of post with id ${postId}`);
  }
  return title;
}
