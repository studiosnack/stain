import { Database } from "sqlite";

import nanoid from "nanoid";
// for image metadata
import sharp from "sharp";
import * as fs from "node:fs/promises";

const METADATA_VERSION = 1;

type User = {
  id: string;
  username: string;
  name: string;
  bio: string;
  url: string;
  enabled: boolean;
  passkey_id: Buffer;
};

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

type Media = {
  id: string;
  uri: string;
  title?: string;
  caption?: string;
  created_on: Date;
  deleted_on?: Date;
  metadata: { [key: string]: any };
  hashtags: string[];
  mentions: string[];
};

export async function getMediaById(
  db: Database,
  id: string
): Promise<Media | undefined> {
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
  username: string;
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
    `INSERT INTO passkeys (id, username, public_key_spki, backed_up) VALUES ($passkey_id, $username, $public_key_spki, $backed_up);`,
    {
      $passkey_id: passkey.id,
      $username: passkey.username,
      $public_key_spki: passkey.public_key_spki,
      $backed_up: passkey.backed_up,
    }
  );
}

export async function existingCredentialsForUsername(
  db: Database,
  username: string
): Promise<PublicKeyCredentialDescriptor[]> {
  let passkeyIds = await db.all<{ id: Buffer }[]>(
    "select id from passkeys where username = $username",
    { $username: username }
  );

  return passkeyIds.map(({ id }) => {
    return { id, type: "public-key" };
  });
}

export async function getPostsByUsername(
  db: Database,
  username: string
): Promise<Post | undefined> {
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
  media: Media[];
  title?: string;
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
    posts.metadata AS post_meta,
    posts.user_id AS post_user_id,

    mediapost.value AS media_id,

    mediadata.created_on AS m_co,
    mediadata.uri AS media_uri,
    mediadata.title AS media_title,
    mediadata.caption AS media_caption

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

async function fileMetaFromPath(path: string) {
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
  } = await img.metadata();
  return {
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
    return {
      media_id: mediaId,
      sharp_metadata: JSON.parse(savedMeta.sharp_metadata),
    };
  }
  console.log(`attempting to load metadata for image at path ${path}`);
  let meta;
  try {
    meta = await fileMetaFromPath(path);
  } catch (err) {
    return { media_id: mediaId, sharp_metadata: {} };
  }
  console.log("parsed image with sharp");
  const res = await db.run(
    `
    insert or ignore into file_meta
    (media_id, sharp_metadata, metadata_version)
    values
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
