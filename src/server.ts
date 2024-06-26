const PORT = 3000;
// whether or not to validate domains (disable if you're having domain issues)
const VALIDATE_DOMAIN = false;
// these specific domains are verified when logging in
const VALIDATED_DOMAINS = [
  // this is just the dev domain
  `http://localhost:${PORT}`,
  // this is whatever domain you want your app hosted under
  "https://foto.generic.cx",
  // mdns here
  `http://skane.local:${PORT}`,
];

// express and middleware
import express from "express";
import session from "express-session";
import { InstaSessionStore } from "./lib/insta-session.js";
import multer from "multer";
import nanoid from "nanoid";

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import path from "node:path";

const DB_PATH = "insta.db";
const MEDIA_PATH = "../media";
const UPLOAD_PATH = path.join(__dirname, MEDIA_PATH, "o", "uploaded");

const uploadStat = fsSync.statSync(UPLOAD_PATH, { throwIfNoEntry: false });
if (!uploadStat?.isDirectory()) {
  console.log(`making directory ${UPLOAD_PATH}`);
  fsSync.mkdirSync(UPLOAD_PATH, { recursive: true });
}

// for db
import { Database, Statement } from "sqlite3";
import { open, Database as PDatabase } from "sqlite";

// for image metadata
import sharp from "sharp";

import {
  inviteDataFromCode,
  existingCredentialsForUsername,
  getUserByName,
  activateInvite,
  getPasskeyById,
  insertNewPasskey,
  getAllMediaForPost,
  insertOrFetchMetaFromMediaIdAtPath,
  getMediaById,
  getPostsByUsername,
  getUserById,
} from "./lib/models.js";

import {
  u8toa,
  atou8,
  parseAuthData,
  verifyAuth,
  parseKey,
  simpleVerifyFromKey,
} from "./lib/cred.js";

async function bootstrapDb() {
  let db: PDatabase | undefined;
  let instaStore: InstaSessionStore | undefined;

  db = await open<Database, Statement>({
    filename: DB_PATH,
    driver: Database,
  });
  instaStore = new InstaSessionStore(db);
  return { db, instaStore };
}

function isValidOrigin(origin: string): Boolean {
  const testingOrigins = [`http://localhost:${PORT}`];
  return testingOrigins.includes(origin);
}

const pathToMedia = (uri: string) => path.join(__dirname, MEDIA_PATH, uri);

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
    user?: {
      name: string;
      id: string;
    };
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

bootstrapDb().then(({ db, instaStore }) => {
  // Multer middleware
  const storage = multer.diskStorage({
    destination: function (_req, _res, cb) {
      const now = new Date();
      const year = `${now.getFullYear()}`;
      const month = `${now.getMonth() + 1}`;
      const dest = path.join(UPLOAD_PATH, year, month);
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
    secret: "water in my head",
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

  app.set("views", `${__dirname}/../src/views`);
  app.set("view engine", "pug");

  app.use(express.static(`${__dirname}/public`));

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

    const { rawId, authenticatorData, signature, clientDataJSON } =
      req.body as {
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

    const userid_req = await getUserByName(db, passkeyData.username);
    if (!userid_req) {
      // not sure how we ended up here: have a valid passkey, but no user in the db
      // maybe this is an account that got renamed
      console.log(`no userid found for ${passkeyData.username}`);
      res.send("no userid?");
      return;
    }
    req.session.userId = userid_req.id;

    // not sure if this is worth logging, maybe short term
    console.log(`auth succeeded for ${passkeyData.username}`);

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
    const existingCredentials = await existingCredentialsForUsername(
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

  // GET /register
  app.post("/register", upload.none(), async (req, res) => {
    const { username, passkey_id, code, pubkey, authdata } = req.body;

    // first find the code, ignore expired whatever for now
    const inviteData = await inviteDataFromCode(db, code);
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
    const dbres = await activateInvite(db, code);

    const insertRes = await insertNewPasskey(db, {
      id: Buffer.from(authData.credentialId),
      username: inviteData.recipient_username,
      public_key_spki: Buffer.from(atou8(pubkey)),
      backed_up: authData.backupState,
    });
    res.redirect("/login");
  });

  // GET /p/:post_id
  // renders an individual post
  app.get("/p/:post_id", async (req, res) => {
    const media = await getAllMediaForPost(db, req.params.post_id);

    const allMeta = await Promise.all(
      media.map((foto) =>
        insertOrFetchMetaFromMediaIdAtPath(
          db,
          foto.media_id,
          pathToMedia(foto.media_uri)
        )
      )
    );
    const reqUrl = new URL(req.url, `${req.protocol}://${req.headers.host}`);
    const { origin } = reqUrl;

    if (media.length > 0) {
      const user = await getUserById(db, media[0].post_user_id);

      const post = {
        title: media[0].post_title,
        id: media[0].post_id,
        created_on: media[0].post_created_on,
        metadata: media[0].post_meta,
      };

      let postTitle =
        post.title ||
        media[0].media_caption ||
        media[0].media_title ||
        media[0].post_title;
      res.render("post", { media, allMeta, post, postTitle, origin, user });
    } else {
      res.status(404);
      res.send("oh no");
    }
  });

  // GET /m/o/:media_id
  // this gets the 'original' media. the idea is we have another
  // set of endpoints like /m/s/:media_id that let you have smaller
  // resized media etc
  app.get("/m/o/:media_id", async (req, res) => {
    const media = await getMediaById(db, req.params.media_id);

    if (media) {
      await insertOrFetchMetaFromMediaIdAtPath(
        db,
        req.params["media_id"],
        pathToMedia(media.uri)
      );

      res.sendFile(pathToMedia(media.uri));
      return;
    }
    res.status(404);
    res.send("wuh woh");
  });

  // GET /upload
  //
  app.get("/upload", withUserMiddleware(db), (req, res) => {
    res.render("upload", { user: req.user ?? {} });
    return;
  });

  app.post(
    "/upload",
    withUserMiddleware(db),
    upload.array("fotos", 3),
    (req, res) => {
      console.log(req.files);
      res.send("ok").end();
    }
  );

  // GET /:username
  //
  app.get("/:username", async (req, res) => {
    if (req.params.username?.trim() !== "") {
      const user = await getUserByName(db, req.params.username);
      if (!user) {
        res.status(404).send("hc svnt dracones").end();
        return;
      }

      const allPosts = await getPostsByUsername(db, req.params.username);

      res.render("all_posts", { allPosts });
    }
  });

  // GET /
  //
  app.get("/", withUserMiddleware(db), (req, res) => {
    res.render("main", { user: req.user ?? {} });
  });

  console.log(`listening of ${PORT}`);
  app.listen(PORT);
});

function withUserMiddleware(db: PDatabase) {
  return async function (
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
  ) {
    if (req.session.userId) {
      let user = await getUserById(db, req.session.userId);
      req.user = user;
    }
    next();
  };
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
