import {
  PORT,
  VALIDATE_DOMAIN,
  VALIDATED_DOMAINS,
  PUBLIC_DOMAIN,
  FEED_PAGESIZE,
  SESSION_SECRET,
  VIEWS_DIR,
  DB_PATH,
  ROOT_MEDIA_PATH,
  UPLOAD_PATH,
} from "./consts";

// express and middleware
import express from "express";
import session from "express-session";
import { InstaSessionStore } from "./lib/insta-session.js";
import multer from "multer";
import nanoid from "nanoid";

import * as fsSync from "node:fs";
import path from "node:path";

import { app as mediaApp } from "./api/media";
import { app as adminApp } from "./api/admin";

const uploadStat = fsSync.statSync(UPLOAD_PATH, { throwIfNoEntry: false });
if (!uploadStat?.isDirectory()) {
  console.log(`- making upload directory ${UPLOAD_PATH}`);
  fsSync.mkdirSync(UPLOAD_PATH, { recursive: true });
} else {
  console.log(`- upload directory found at path ${UPLOAD_PATH}`);
}

import Database, { type Database as BSDatabase } from "better-sqlite3";

import {
  inviteDataFromCode,
  existingCredentialsForUserId,
  getUserByName,
  activateInvite,
  getPasskeyById,
  insertNewPasskey,
  getAllMediaForPost,
  insertOrFetchMetaFromMediaIdAtPath,
  getPostsByUsername,
  getUserById,
  emptyMediaAtPath,
  insertMediaForUser,
  insertPostForUser,
  updateTitleForPost,
  getPostForId,
  updateUsername,
  updateName,
  insertNewUser,
  getInvitableUsers,
  getReferencedUsers,
  selectInvitedUsers,
  createInviteForUser,
  type User,
  type InvitedUser,
  type Media,
} from "./lib/models.js";

import {
  u8toa,
  atou8,
  parseAuthData,
  verifyAuth,
  parseKey,
  simpleVerifyFromKey,
} from "./lib/cred.js";

import { isValidOrigin, pathToMedia } from "./lib/utils";

function bootstrapDb() {
  let db: BSDatabase | undefined;
  let instaStore: InstaSessionStore | undefined;

  // bootstrap tables if db path doesn't exist
  let runBootstrap = !fsSync.existsSync(DB_PATH);

  db = Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  if (runBootstrap) {
    const bootstrapSql = fsSync.readFileSync(
      path.join(__dirname, "sql/bootstrap.sql"),
      "utf8"
    );
    db.exec(bootstrapSql);
    const newUser = insertNewUser(db, "me", "first user");
    if (newUser) {
      const newInvite = createInviteForUser(db, newUser.id);
      if (newInvite) {
        console.log(`Invited first user (@${newUser.name})`)
        console.log(`-> Complete signup at http://localhost:${PORT}/signup/${newInvite.code}`)
      }
    }
  }

  instaStore = new InstaSessionStore(db);
  return { db, instaStore };
}

declare module "express-session" {
  interface SessionData {
    challenge?: any;
    userId?: string;
  }
}

import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
    db?: BSDatabase;
  }
}

type ParsedClientDataJson = {
  // The base64url encoded version of the cryptographic challenge sent from the relying party's server. The original value are passed as the challenge option in CredentialsContainer.get() or CredentialsContainer.create().
  challenge: string;
  // A boolean. If set to true, it means that the calling context is an <iframe> that is not same origin with its ancestor frames.
  crossOrigin?: boolean;
  // The fully qualified origin of the relying party which has been given by the client/browser to the authenticator. We should expect the relying party's id to be a suffix of this value.
  origin: string;
  // An object describing the state of the token binding protocol for the communication with the relying party. It has two properties:
  // Should this property be absent, it would indicate that the client does not support token binding.
  // Note: tokenBinding is deprecated as of Level 3 of the spec, but the field is reserved so that it won't be reused for a different purpose.
  tokenBinding?: {
    // status: A string which is either "supported" which indicates the client support token binding but did not negotiate with the relying party or "present" when token binding was used already
    status: "supported" | "present";
    // id: A string which is the base64url encoding of the token binding ID which was used for the communication.
    id: string;
  };
  // Contains the fully qualified top-level origin of the relying party. It is set only if it crossOrigin is true.
  topOrigin?: string;
  // A string which is either "webauthn.get" when an existing credential is retrieved or "webauthn.create" when a new credential is created.
  type: "webauthn.get" | "webauthn.create";
};

const { db, instaStore } = bootstrapDb();
// Multer middleware
const storage = multer.diskStorage({
  destination: function (req, _res, cb) {
    if (req.user?.id == null) {
      // only allow multer uploads per-user when logged in
      return cb(new Error("need to be logged in to upload media"), "");
    }

    const now = new Date();
    const year = `${now.getFullYear()}`;
    const month = `${now.getMonth() + 1}`;
    const dest = path.join(UPLOAD_PATH, req.user.id, year, month);
    fsSync.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = nanoid.nanoid(5);
    cb(null, `${file.fieldname}-${uniqueSuffix}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Session Middleware
const sess = session({
  name: "insta",
  store: instaStore,
  secret: SESSION_SECRET,
  saveUninitialized: false,
  resave: false,
  cookie: {
    path: "/",
    httpOnly: true,
    secure: false,
    maxAge: 30 * 86_400 * 1000,
  },
});

// App goes here
const app = express();
app.use(sess);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

console.log(`setting views dir to ${VIEWS_DIR}`);
app.set("views", VIEWS_DIR);
app.set("view engine", "pug");

// health check
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

app.get("/.well-known/webauthn", (req, res) => {
  console.log("fielding webauthn request");
  res.json({
    origins: ["https://snaps.orb.local", "https://snaps.studiosnack.net"],
  });
});

app.use((req, res, next) => {
  req.db = db;
  next();
});

// TODO: make this configurable
const static_public_dir = `${__dirname}/public`;

console.log(`static assets served from: ${static_public_dir}`);
app.use(
  // Set content type headers for hif/heif/heic images
  express.static(`${static_public_dir}`, {
    setHeaders(res, path, stat) {
      if (path.endsWith(".heic")) {
        res.set("Content-Type", "image/heic");
      }
      if (path.endsWith(".heif") || path.endsWith(".hif")) {
        res.set("Content-Type", "image/heif");
      }
    },
  })
);

// mediaApp serves media, both cached and dynamically
// resized for various resolutions
app.use("/m", mediaApp);

// These aren't so much admin routes but they handle
// invites, username renames, etc.
app.use("/admin", adminApp);

// POST /login
// requires POST with formadata
// - rawId
// - authenticatorData
// - clientDataJson
// - signature
// all above fields are u8toa'd arraybuffers
// this route is assumed to be accessed via a fetch() call
// so it doesn't do any redirecting on its own
// TODO(marcos): maybe refactor the auth part from the web parts here
//
app.post("/login", upload.none(), async (req, res) => {
  // bail early if no session
  if (req.session.challenge == null) {
    res.status(400).end();
    return;
  }

  const { rawId, authenticatorData, signature, clientDataJSON } = req.body as {
    rawId: string;
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
  };

  const cdj: ParsedClientDataJson = JSON.parse(
    Buffer.from(atou8(clientDataJSON)).toString()
  );
  // the session is b64url encoded in the client data json which
  // means we need to make all the following changes here.
  // we do have to do this otherwise we could just replay a valid
  // login many times.
  //
  // This particular change here has to do with how the browser converts the challenge
  // not just as b64, but as "b64 url safe", which mdn describes like this:
  // > A common variant is "Base64 URL safe", which omits the padding and replaces +/ with -_
  // > to avoid characters that might cause problems in URL path segments or query parameters.
  const b64UrlSessionChallenge = req.session.challenge
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  if (b64UrlSessionChallenge !== cdj?.challenge) {
    // TODO(marcos): should log this meaningfully along with req id
    console.log(
      `bad challenge\nexpected:\n-${b64UrlSessionChallenge}\ngot:\n+${cdj.challenge}`
    );
    // if we fail the challenge, we need to reset the challenge so that
    // a client can't attempt to auth with it again.
    req.session.challenge = null;
    res.status(401).send("bad challenge").end();
    return;
  }

  if (cdj.type !== "webauthn.get") {
    res.status(401).send(`bad webauthn type: ${cdj.type}`);
  }
  // there's not a good reason to support this imo, but
  // maybe somebody will suggest a reason
  if (cdj.crossOrigin === true) {
    res.status(401).send(`crossOrigin logins not permitted`);
  }
  // check domain, optionally
  if (VALIDATED_DOMAINS.includes(cdj.origin)) {
    console.log(`matched client data json origin on login: ${cdj.origin}`);
    if (!VALIDATE_DOMAIN) {
      console.log(
        "your validated domains appear to match the submitted client data json"
      );
    }
  } else {
    if (VALIDATE_DOMAIN) {
      res.status(401).send(`bad cdj origin: ${cdj.origin}`);
    } else {
      console.log(
        `client data json origin (${
          cdj.origin
        }) doesnt match configured origins: ${VALIDATED_DOMAINS.join(", ")}`
      );
    }
  }

  const passkeyData = await getPasskeyById(db, Buffer.from(atou8(rawId)));

  // bail if we don't have a matching passkey (could prompt
  // for acct recovery in this case or just treat it like a bad login)
  if (!passkeyData) {
    res.status(401).end();
    return;
  }

  const key = await parseKey(new Uint8Array(passkeyData.public_key_spki));

  const webResult = await verifyAuth(
    key,
    Buffer.from(atou8(signature)),
    Buffer.from(atou8(authenticatorData)),
    Buffer.from(atou8(clientDataJSON))
  );

  if (!webResult) {
    res.status(401).end();
    return;
  }

  const userid_req = await getUserById(db, passkeyData.user_id);
  if (!userid_req) {
    // not sure how we ended up here: have a valid passkey, but no user in the db
    // maybe this is an account that got renamed
    console.log(`no user found for id ${passkeyData.user_id}`);
    res.send("no userid?");
    return;
  }
  req.session.userId = userid_req.id;

  // not sure if this is worth logging, maybe short term
  console.log(`auth succeeded for ${passkeyData.user_id}`);

  res.send("ok").status(200).end();
});

// GET /login
app.get("/login", async (req, res) => {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  req.session.challenge = u8toa(challenge);

  res.render("login", { challenge: req.session.challenge });
});

// GET /logout
app.get("/logout", (req, res) => {
  const userId = req.session.userId;
  if (userId) {
    req.session.destroy(() => {
      console.log(`logging out userid: ${userId}`);
    });
  }
  res.redirect("/");
  return;
});

// GET /signup/:code
app.get("/signup/:code", async (req, res) => {
  const inviteData = await inviteDataFromCode(db, req.params.code);

  if (!inviteData) {
    res.status(404).send("invite not found").end();
    return;
  }

  // get existing passkeys here:
  const existingCredentials = await existingCredentialsForUserId(
    db,
    inviteData.recipient_username
  );
  const existing_credentials = JSON.stringify(
    existingCredentials.map((cred) => ({
      ...cred,
      // @ts-ignore - this is an ok type for cred.id
      id: u8toa(new Uint8Array(cred.id)),
    }))
  );
  res.render("signup", {
    ...inviteData,
    // passkey_id is blob/buffer unless encoded here
    passkey_id: inviteData.passkey_id.toString("base64"),
    existing_credentials,
  });
});

app.post(
  "/register/username",
  withUserMiddleware(db),
  async (req, res, next) => {
    if (req.user != null && req.user.referenced_by == null) {
      if (
        req.body.requested_handle == null &&
        req.body.requested_handle.trim() == ""
      ) {
        res.status(400).send("verba non acta").end();
        return;
      }

      const newUser = insertNewUser(
        db,
        req.body.requested_handle,
        req.body.common_name,
        req.user?.id
      );
      console.log(newUser);
    }
    res.redirect("/");
  }
);

// GET /register
app.post("/register", upload.none(), async (req, res) => {
  const { username, passkey_id, code, pubkey, authdata } = req.body;

  // first find the code, ignore expired whatever for now
  const inviteData = inviteDataFromCode(db, code);
  if (!inviteData) {
    return
  }
  const invitedUser = getUserByName(db, inviteData?.recipient_username)
  if (!invitedUser) {
    return
  }
  const authData = parseAuthData(atou8(authdata));

  if (!inviteData) {
    res.status(400).send("no invite for code").end();
    return;
    // uncomment to require 'fresh' codes
    // } else if (inviteData.activated_on != null) {
    //   res.status(400).send('invite already activated').end();
    //   return;
  } else if (inviteData.deleted_on != null) {
    res.status(400).send("invite was deleted").end();
    return;
  } else if (inviteData.recipient_username != username) {
    res.status(400).send("invite was for a different user").end();
    return;
  }

  // TODO put this in a txn
  const dbres = activateInvite(db, code);

  const insertRes = insertNewPasskey(db, {
    id: Buffer.from(authData.credentialId),
    user_id: invitedUser?.id,
    public_key_spki: Buffer.from(atou8(pubkey)),
    backed_up: authData.backupState,
  });
  // '/' includes login
  res.redirect("/");
});

app.put("/p/:post_id/title", withUserMiddleware(db), async (req, res, next) => {
  const post = await getPostForId(db, req.params.post_id);
  if (req.user != null && post?.user_id === req.user.id) {
    const nextTitle = await updateTitleForPost(db, post.id, req.body.title);
    return res
      .set({ "content-type": "application/json" })
      .send({ title: nextTitle })
      .end();
  } else {
    return res.sendStatus(403).send("hc svnt dracones");
  }
});

app.get("/p/:post_id/meta", withUserMiddleware(db), async (req, res, next) => {
  const post = await getPostForId(db, req.params.post_id);

  let media = await getAllMediaForPost(db, req.params.post_id);
  media = media.map((m) => ({
    ...m,
    media_meta: JSON.parse(m.media_meta),
  }));

  const allMeta = await Promise.all(
    media.map((foto) =>
      insertOrFetchMetaFromMediaIdAtPath(
        db,
        foto.media_id,
        pathToMedia(foto.media_uri)
      )
    )
  );

  res.render("meta", { allMeta, media, post });
  // if (req.user != null && post?.user_id === req.user.id) {
  //   const nextTitle = await updateTitleForPost(db, post.id, req.body.title);
  //   res.send(nextTitle).end();
  // }
});

// GET /p/:post_id
// renders an individual post
app.get("/p/:post_id", withUserMiddleware(db), async (req, res) => {
  let media = await getAllMediaForPost(db, req.params.post_id);
  media = media.map((m) => ({ ...m, media_meta: JSON.parse(m.media_meta) }));

  let meta = await Promise.all(
    media.map((foto) =>
      insertOrFetchMetaFromMediaIdAtPath(
        db,
        foto.media_id,
        pathToMedia(foto.media_uri)
      )
    )
  );

  let allMeta = meta.map((foto) => {
    const minWidth = Math.min(1080, foto?.sharp_metadata?.width);
    const ogHeight =
      (minWidth * foto?.sharp_metadata?.height) / foto?.sharp_metadata?.width;
    return { ...foto, og: { width: minWidth, height: ogHeight } };
  });

  const reqUrl = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const { origin } = reqUrl;

  if (media.length > 0) {
    const user = await getUserById(db, media[0].post_user_id);

    const post = {
      title: media[0].post_title,
      id: media[0].post_id,
      created_on: media[0].post_created_on,
      // metadata: media[0].media_meta,
    };

    let postTitle =
      post.title ||
      media[0].media_caption ||
      media[0].media_title ||
      media[0].post_title;
    res.render("post", {
      media,
      allMeta,
      post,
      postTitle,
      origin,
      user,
      userOwnsMedia: req.user?.id != null && user?.id === req.user?.id,
    });
  } else {
    res.status(404);
    res.send("oh no");
  }
});

// GET /upload
//
app.get("/upload", withUserMiddleware(db), (req, res) => {
  if (!req.user?.id) {
    return res.send("hc svnt dracones").end();
  }
  res.render("upload", { user: req.user ?? {} });
  return;
});

app.post(
  "/upload",
  withUserMiddleware(db),
  upload.array("fotos"),

  async (req, res) => {
    console.log(req.files);
    if (!req.files) {
      res.send("no media?").end();
    }
    if (Array.isArray(req.files) && req.user != null) {
      const postMedia = req.files.map((fileOb) => {
        return emptyMediaAtPath(fileOb.path);
      });
      const mediaIds = insertMediaForUser(
        db,
        postMedia,
        req.user.id,
        ROOT_MEDIA_PATH
      );
      const postId = insertPostForUser(db, mediaIds, req.user.id);
      res.redirect(`/p/${postId}`);
    }
  }
);

// after this middleware, req.params.username is guaranteed to refer
// to a user in the app
const hasUserOr404Middleware = async (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => {
  if (req.params.username?.trim() !== "") {
    const user = getUserByName(db, req.params.username);
    if (!user) {
      res.status(404).send("hc svnt dracones").end();
      return;
    }
  }
  next();
};

const { performance } = require("node:perf_hooks");
// GET /:username
//
app.get("/:username", hasUserOr404Middleware, async (req, res) => {
  const start = performance.now();
  const user = getUserByName(db, req.params.username);
  const allPosts = getPostsByUsername(db, req.params.username);
  const beforeRender = performance.now();
  const duration = beforeRender - start;
  console.log(`user page db requests completed in ${duration} ms`);

  return res.render("all_posts", { allPosts: allPosts, user }, (err, html) => {
    const postRender = performance.now();

    console.log(`rendered page in ${postRender - beforeRender} ms`);
    res.send(html);
  });
});

app.get("/:username/feed.json", hasUserOr404Middleware, async (req, res) => {
  let { username, after } = req.params;
  username = username.trim();

  const allPosts = await getPostsByUsername(db, username);
  let items = [];
  let requestHost = `${req.protocol}://${req.hostname}`;
  let hostedUrl = `${requestHost}/${username}/feed.json`;

  let title = `${req.params.username} ✕ fotos`;
  let version = "https://jsonfeed.org/version/1";
  // TODO use the proper var for this domain
  let home_page_url = `${requestHost}/${username}`;
  let feed_url = `${home_page_url}/feed.json`;

  let startIndex = 0;
  let afterKey = after?.trim() ?? "";
  if (afterKey !== "") {
    // if key isn't present, this defaults to starting at 0
    startIndex = allPosts.findIndex((post) => post.id === afterKey) + 1;
  }
  let stopIndex = Math.min(startIndex + FEED_PAGESIZE, allPosts.length);
  let next_url = undefined;
  if (stopIndex <= allPosts.length) {
    let stopKey = allPosts.at(stopIndex - 1)?.id as string;
    next_url = `${feed_url}?after=${stopKey}`;
  }
  items = allPosts.slice(startIndex, stopIndex).map((post) => ({
    id: post.id,
    url: `${requestHost}/p/${post.id}`,
  }));

  res.set({ "content-type": "application/feed+json" }).json({
    version,
    title,
    home_page_url,
    feed_url,
    next_url,
    authors: [
      {
        name: username,
        url: `${hostedUrl}/${username}`,
      },
    ],
    items: items,
  });
});

function* chonk<T>(arr: T[], size = 3): Generator<T[], void, T[]> {
  const slices = Math.ceil(arr.length / size);
  for (let i = 0; i < slices; i += 1) {
    yield arr.slice(i * size, (i + 1) * size);
  }
}

// GET /:username
//
//   app.get("/u/:username", async (req, res) => {
//     if (req.params.username?.trim() !== "") {
//       const user = await getUserByName(db, req.params.username);
//       if (!user) {
//         res.status(404).send("hc svnt dracones").end();
//         return;
//       }
//
//       const allPosts = await getPostsByUsername(db, req.params.username);
//
//       res.render("all_posts", { allPosts: [...chonk(allPosts, 9)], user });
//     }
//   });

// GET /
//
app.get("/", withUserMiddleware(db), async (req, res) => {
  let usersToInvite: User[] = [];
  let usersToPromote: User[] = [];
  let invitedUsers: InvitedUser[] = [];
  if (req.user != null && req.user.referenced_by == null) {
    usersToInvite = await getInvitableUsers(db, req.user.id);
    usersToPromote = await getReferencedUsers(db, req.user.id);
    invitedUsers = await selectInvitedUsers(db, req.user.id);
  } else {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    req.session.challenge = u8toa(challenge);
  }
  res.render("main", {
    user: req.user ?? {},
    usersToInvite,
    usersToPromote,
    invitedUsers,
    // possibly null
    challenge: req.session.challenge,
  });
});

console.log(`listening of ${PORT}`);
app.listen(PORT);

function withUserMiddleware(db: BSDatabase) {
  // populates req.user if user is logged in
  return async function (
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
  ) {
    if (req.session.userId) {
      let user = await getUserById(db, req.session.userId);
      if (user) {
        req.user = user;
      }
    }
    next();
  };
}
