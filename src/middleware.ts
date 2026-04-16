import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";
import session from "express-session";
import { type Database } from 'better-sqlite3';
import multer from "multer";
import nanoid from "nanoid";

import * as fsSync from "node:fs";
import path from "node:path";

import { InstaSessionStore } from "./lib/insta-session.js";


import { UPLOAD_PATH, SESSION_SECRET } from './consts'
import db from './db';
import * as models from "./lib/models";

import invariant from "./lib/mini-invariant";

declare namespace Express {
  interface Request {
    user?: models.User;
    db?: Database;
  }
}

declare module "express-session" {
  interface SessionData {
    challenge?: any;
    userId?: string;
  }
}

/**
 * builds an instance of the session middleware using global db
 */
export function withInstaSession() {
  let instaStore = new InstaSessionStore(db);

  // Session Middleware
  const sessionMiddleware = session({
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
  return sessionMiddleware; 
}

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
export const upload = multer({ storage });


export function withDbMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) {
  if (!req.db) {
    res.status(500).send("de notitia abiit");
    return;
  }
  return next();
}

export async function sessionContainsUserMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) {
  invariant(req.db, "database missing");
  if (req.session.userId) {
    let user = await models.getUserById(req.db, req.session.userId);
    if (user) {
      req.user = user;
    }
  }
  return next();
}

/**
  for active sessions, ensures that a user is attached
  to the request
 */
export async function withUserMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) {

  if (req.session.userId) {
    let user = await models.getUserById(db, req.session.userId);
    if (user) {
      req.user = user;
    }
  }
  return next();
}
