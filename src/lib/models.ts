import { Database } from "sqlite";

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

export async function getInvitableUsers(
  db: Database,
  currentUserId: string
): Promise<User[]> {
  return await db.all(
    `select * from users where enabled is true and id != :currentUserId`,
    { ":currentUserId": currentUserId }
  );
}

export async function getReferencedUsers(
  db: Database,
  currentUserId: string
): Promise<User[]> {
  return await db.all(
    `select * from users where enabled is false and referenced_by = :currentUserId`,
    { ":currentUserId": currentUserId }
  );
}

export async function getUserByName(
  db: Database,
  username: string
): Promise<User | undefined> {
  return db.get(`SELECT * from users where username = $username`, {
    $username: username,
  });
}

export async function getUserById(
  db: Database,
  userId: string
): Promise<User | undefined> {
  return db.get(`SELECT * from users where id = $userId`, {
    $userId: userId,
  });
}

export async function insertNewUser(
  db: Database,
  username: string,
  name: string = "",
  invitingUserId: string | null
): Promise<User | undefined> {
  const userId = nanoid.nanoid(5);
  await db.run(
    "INSERT INTO users (id, username, name, enabled, referenced_by) values (:id, :username, :name, :enabled, :referenced_by)",
    {
      ":id": userId,
      ":username": username,
      ":name": name,
      ":enabled": true,
      ":referenced_by": invitingUserId,
    }
  );
  return await getUserById(db, userId);
}

export type InvitedUser = {
  id: string;
  username: string;
  name: string;
  code: string;
  activated_on: number;
};

export async function selectInvitedUsers(
  db: Database,
  invitingUser: string
): Promise<InvitedUser[]> {
  return db.all(
    `SELECT 
      users.id as id, 
      users.username as username, 
      users.name as name,
      invites.code as code, 
      invites.activated_on as activated_on 
    FROM invites 
    LEFT JOIN users 
    ON users.id = invites.recipient_id
    WHERE sender_id = :invitingUser`,
    { ":invitingUser": invitingUser }
  );
}

export async function updateUsername(
  db: Database,
  userId: string,
  newUsername: string
): Promise<User | undefined> {
  try {
    await db.run(
      "UPDATE users set username = :newUsername where id = :userId",
      {
        ":newUsername": newUsername,
        ":userId": userId,
      }
    );
    return getUserById(db, userId);
  } catch (err) {
    console.log("ooops");
    console.error(err);
  }
}

export async function updateName(
  db: Database,
  userId: string,
  newName: string
): Promise<User | undefined> {
  try {
    await db.run("UPDATE users set name = :newName where id = :userId", {
      ":newName": newName,
      ":userId": userId,
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

export async function createInviteForUser(
  db: Database,
  recipientId: string,
  senderId: string
): Promise<Invite | undefined> {
  const code = `${nanoInviteId()}-${nanoInviteId()}`;
  await db.run(
    `
    INSERT INTO invites (
      recipient_id, 
      sender_id, 
      code
    ) VALUES (
      :recipient_id, 
      :sender_id, 
      :code
    )`,
    { ":recipient_id": recipientId, ":sender_id": senderId, ":code": code }
  );
  return db.get(`select * from invites where code = :code`, { ":code": code });
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

export async function getMediaById(
  db: Database,
  id: string
): Promise<Media | undefined> {
  // TODO(marcos): parse created_on/deleted_on as dates * 1000
  return db.get("select * from media where id = :media_id", {
    ":media_id": id,
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

export async function inviteDataFromCode(
  db: Database,
  code: string
): Promise<InviteData | undefined> {
  return db.get<InviteData>(
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
    `,
    { ":code": code }
  );
}

export function activateInvite(
  db: Database,
  code: string,
  when: string = "now"
) {
  return db.get(
    `UPDATE invites SET activated_on=strftime('%s', $when) where code = $code;`,
    { $code: code, $when: when }
  );
}

type Passkey = {
  id: Buffer;
  user_id: string;
  public_key_spki: Buffer;
  backed_up: boolean;
};

export async function getPasskeyById(
  db: Database,
  id: Buffer
): Promise<Passkey | undefined> {
  return db.get<Passkey>(`SELECT * FROM passkeys where id = $id`, {
    $id: id,
  });
}

export function insertNewPasskey(db: Database, passkey: Passkey) {
  return db.get(
    `INSERT INTO passkeys (id, user_id, public_key_spki, backed_up) VALUES ($passkey_id, $username, $public_key_spki, $backed_up);`,
    {
      $passkey_id: passkey.id,
      $username: passkey.user_id,
      $public_key_spki: passkey.public_key_spki,
      $backed_up: passkey.backed_up,
    }
  );
}

export async function existingCredentialsForUserId(
  db: Database,
  userId: string
): Promise<PublicKeyCredentialDescriptor[]> {
  let passkeyIds = await db.all<{ id: Buffer }[]>(
    "select id from passkeys where user_id = $userId",
    { $userId: userId }
  );

  return passkeyIds.map(({ id }) => {
    return { id, type: "public-key" };
  });
}

export async function getPostForId(
  db: Database,
  postId: string
): Promise<Post | undefined> {
  return db.get(`SELECT * from posts where id = :id`, { ":id": postId });
}

export async function getPostsByUsername(
  db: Database,
  username: string
): Promise<Post[]> {
  return db.all(
    `SELECT *
    FROM posts
    WHERE posts.user_id = (
      SELECT id FROM users WHERE users.username = $username
    )
    ORDER BY posts.created_on DESC`,
    { $username: username }
  );
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

export async function getAllMediaForPost(
  db: Database,
  postId: string
): Promise<PostMedia[]> {
  const media = await db.all(
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
`,
    { ":post_id": postId }
  );
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
  const savedMeta = await db.get(
    `
      SELECT media_id, sharp_metadata
      FROM file_meta
      WHERE
        media_id = :media_id
      AND
        metadata_version = :metadata_version`,
    {
      ":media_id": mediaId,
      ":metadata_version": METADATA_VERSION,
    }
  );
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
  const res = await db.run(
    `
    INSERT OR IGNORE INTO file_meta
    (media_id, sharp_metadata, metadata_version)
    VALUES
    (:media_id, :sharp_metadata, :metadata_version)
  `,
    {
      ":media_id": mediaId,
      ":sharp_metadata": JSON.stringify(meta),
      ":metadata_version": METADATA_VERSION,
    }
  );
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
      await db.run(
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
      `,
        {
          ":id": medium.id,
          ":user_id": userId,
          ":uri": medium.uri,
          ":title": medium.title,
          ":caption": medium.caption,
          // TODO(marcos): make created_on variable here (need to find strftime)
        }
      );
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
export async function insertPostForUser(
  db: Database,
  mediaIds: string[],
  userId: string
): Promise<string> {
  const id = nanoid.nanoid(5);
  const media = JSON.stringify(mediaIds);
  try {
    await db.run(
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
    `,
      {
        ":id": id,
        ":user_id": userId,
        ":media": media,
      }
    );
  } catch (err) {
    console.error(`Failed to create post with id ${id}, with media: ${media}`);
    console.error(err);
  }
  return id;
}

export async function updateTitleForPost(
  db: Database,
  postId: string,
  title: string
): Promise<string> {
  try {
    await db.run(
      `
      UPDATE posts SET title = :title where id = :postId
    `,
      {
        ":title": title,
        ":postId": postId,
      }
    );
  } catch (err) {
    console.error(`failed to update title of post with id ${postId}`);
    console.error(err);
    throw new Error(`failed to update title of post with id ${postId}`);
  }
  return title;
}
