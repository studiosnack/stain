const express = require('express');
const app = express();
const multer = require('multer');
const path = require('path');
// unused in new code
const exifReader = require('exif-reader');

const {Database} = require('sqlite3');
const {open} = require('sqlite');

const fs = require('fs/promises');
const sharp = require('sharp');

// const upload = multer({ dest: 'uploads/'})
const storage = multer.memoryStorage();
const upload = multer({storage});

const PORT = 3000;

const DB_PATH = 'insta.db';
const ARCHIVE_PATH = '../archives/nsfmc_20230203';
const METADATA_VERSION = 1;

let db;
(async function () {
  db = await open({
    filename: DB_PATH,
    driver: Database,
  });
})();

app.set('views', `${__dirname}/../src/views`);
app.set('view engine', 'pug');

app.use(express.static('src/public'));

const parseMedia = (media) => {
  return {...media, metadata: JSON.parse(media.metadata)};
};
const pathToMedia = (uri) => path.join(__dirname, ARCHIVE_PATH, uri);

app.get('/api/media/:media_id', async (req, res) => {
  const media = await db.get('select * from media where id = :media_id', {
    ':media_id': req.params['media_id'],
  });
  res.send(parseMedia(media));
});

app.get('/m/s/:media_id', async (req, res) => {
  const media = await db.get('select * from media where id = :media_id', {
    ':media_id': req.params['media_id'],
  });

  media_path = pathToMedia(media.uri);
  try {
    const buf = await fs.readFile(media_path);
    const resized = await sharp(buf).resize({height: 360}).toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.send(resized);
  } catch (err) {
    console.log('oh');
  }
});

app.get('/m/m/:media_id', async (req, res) => {
  const media = await db.get('select * from media where id = :media_id', {
    ':media_id': req.params['media_id'],
  });

  media_path = pathToMedia(media.uri);
  try {
    const buf = await fs.readFile(media_path);
    const resized = await sharp(buf).resize({height: 900}).toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.send(resized);
  } catch (err) {
    console.log('oh');
  }
});

async function fileMetaFromPath(path) {
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

async function insertOrFetchMetaFromMediaIdAtPath(mediaId, path) {
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
      ':media_id': mediaId,
      ':metadata_version': METADATA_VERSION,
    },
  );
  if (savedMeta) {
    console.log(`meta query finished in ${new Date() - start}ms`);
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
    return {media_id: mediaId, sharp_metadata: {}};
  }
  console.log('parsed image with sharp');
  const res = await db.run(
    `
    insert or ignore into file_meta
    (media_id, sharp_metadata, metadata_version)
    values
    (:media_id, :sharp_metadata, :metadata_version)
  `,
    {
      ':media_id': mediaId,
      ':sharp_metadata': JSON.stringify(meta),
      ':metadata_version': METADATA_VERSION,
    },
  );
  console.log(`meta query finished in ${new Date() - start}ms`);
  return {media_id: mediaId, sharp_metadata: meta};
}

app.get('/m/o/:media_id', async (req, res) => {
  const media = await db.get('select * from media where id = :media_id', {
    ':media_id': req.params['media_id'],
  });

  if (media.uri) {
    console.log(`loading image at ${pathToMedia(media.uri)}`);
    await insertOrFetchMetaFromMediaIdAtPath(
      req.params['media_id'],
      pathToMedia(media.uri),
    );

    res.sendFile(pathToMedia(media.uri));
    return;
  }
  res.status(404);
  res.send('wuh woh');
});

app.get('/m/:media_id', async (req, res) => {
  const media = await db.get('select * from media where id = :media_id', {
    ':media_id': req.params['media_id'],
  });

  // res.sendFile(path.join(__dirname, ARCHIVE_PATH, media.uri));
  media_path = pathToMedia(media.uri);
  try {
    const buf = await fs.readFile(media_path);
    const resized = await sharp(buf).resize({height: 360}).toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.send(resized);
  } catch (err) {
    console.log('oh');
  }
});

async function getAllMediaForPost(postId) {
  const media = await db.all(
    `SELECT
    posts.id AS post_id,
    posts.title AS post_title,
    posts.created_on AS post_created_on,
    posts.metadata AS post_meta,

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
    {':post_id': postId},
  );
  return media;
}

app.get('/p/:post_id', async (req, res) => {
  const media = await getAllMediaForPost(req.params.post_id);

  const allMeta = await Promise.all(
    media.map((foto) =>
      insertOrFetchMetaFromMediaIdAtPath(
        foto.media_id,
        pathToMedia(foto.media_uri),
      ),
    ),
  );
  const reqUrl = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const {origin} = reqUrl;
  console.log({reqUrl});
  if (media.length > 0) {
    res.render('post', {media, allMeta, post: {}, origin});
  } else {
    res.status(404);
    res.send('oh no');
  }
});

app.post('/photo/new', upload.single('foto'), async (req, res, next) => {
  try {
    const buf = req.file.buffer;
    const meta = await sharp(buf).metadata();
    const exifMeta = exifReader(meta.exif);

    res.send('ok?');
  } catch (err) {
    console.error(err);
    res.send('wuh woh');
  }
});

app.get('/login', async (req, res) => {
  res.render('login');
});

app.post('/register', upload.none(), async (req, res) => {
  const {username, passkey_id, code, pubkey, authdata} = req.body;
  // first find the code, ignore expired whatever for now
  const inviteData = await inviteDataFromCode(code);
  const authData = parseAuthData(atou8(authdata));

  if (!inviteData) {
    res.status(400).send('no invite for code').end();
    return;
  // } else if (inviteData.activated_on != null) {
  //   res.status(400).send('invite already activated').end();
  //   return;
  } else if (inviteData.deleted_on != null) {
    res.status(400).send('invite was deleted').end();
    return;
  } else if (inviteData.recipient_username != username) {
    res.status(400).send('invite was for a different user').end();
    return;
  }
  if (authData)

  console.log(authData);

  const dbres = await db.get(
    `UPDATE invites SET activated_on=strftime('%s', 'now') where code = $code;`,
    {$code: code},
  );
  console.log(dbres);
  const insertRes = await db.get(
    `INSERT INTO passkeys (id, username, public_key_spki, backed_up) VALUES ($passkey_id, $username, $public_key_spki, $backed_up);`,
    {
      $passkey_id: Buffer.from(authData.credentialId),
      $username: inviteData.recipient_username,
      $public_key_spki: Buffer.from(atou8(pubkey)),
      $backed_up: authData.backupState,
    },
  );
  console.log(insertRes);
  res.redirect('/login');
});

async function inviteDataFromCode(code) {
  return db.get(
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
    {':code': code},
  );
}

function atou8(b64ascii) {
  return Uint8Array.from(Buffer.from(b64ascii, 'base64'));
}
function u8toa(u8arr) {
  return Buffer.from(u8arr).toString('base64');
}

function parseAuthData(authData) {
  // see https://w3c.github.io/webauthn/#sctn-authenticator-data
  const rpiHash = new Uint8Array(authData.buffer, 0, 32);

  const flags = authData[32];
  const [
    userPresent,
    rfu1,
    userVerified,
    backupEligible,
    backupState,
    rfu2,
    atPresent,
    edPresent,
  ] = [
    flags & 1,
    (flags >> 1) & 1,
    (flags >> 2) & 1,
    (flags >> 3) & 1,
    (flags >> 4) & 1,
    (flags >> 5) & 1,
    (flags >> 6) & 1,
    (flags >> 7) & 1,
  ];

  // attested credential data starts at offset 33
  // https://w3c.github.io/webauthn/#sctn-attested-credential-data
  const signCount = new DataView(
    new Uint8Array(authData.buffer, 33, 4).buffer,
  ).getUint32();

  const aaguid = new Uint8Array(authData.buffer, 37, 16);
  const credentialIdLength = new DataView(authData.buffer, 53, 2).getUint16();

  const credentialId = new Uint8Array(authData.buffer, 55, credentialIdLength);
  const credentialIdB64 = u8toa(credentialId);

  return {
    userPresent,
    userVerified,
    backupEligible,
    backupState,
    atPresent,
    edPresent,
    signCount,
    aaguid,
    credentialId,
    credentialIdB64,
  };
}

app.get('/signup/:code', async (req, res) => {
  const start = +new Date();
  const inviteData = await inviteDataFromCode(req.params.code);
  // console.log(req.params.code, inviteData)
  if (!inviteData) {
    res.status(404).send('invite not found').end();
    return;
  }
  const stop = +new Date();
  console.log(`queried in ${stop - start}ms`);
  console.log(
    typeof inviteData.passkey_id,
    u8toa(inviteData.passkey_id),
    inviteData.passkey_id.toString('base64'),
  );
  res.render('signup', {
    ...inviteData,
    // passkey_id is blob and a buffer unless encoded here
    passkey_id: inviteData.passkey_id.toString('base64'),
  });
});

app.get('/', async (req, res) => {
  const allPosts = await db.all('select * from posts order by created_on desc');
  res.render('all_posts', {allPosts});
});

console.log(`listening of ${PORT}`);

app.listen(PORT);
