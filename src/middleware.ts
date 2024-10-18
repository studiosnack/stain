import * as models from "./lib/models";

import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";

import { Database as PDatabase } from "sqlite";
import invariant from "./lib/mini-invariant";

export function withDbMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) {
  if (!req.db) {
    res.status(500).send("de notitia abiit");
    return;
  }
  next();
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
  next();
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
  invariant(req.db, "database missing");

  if (req.session.userId) {
    let user = await models.getUserById(req.db, req.session.userId);
    if (user) {
      req.user = user;
    }
  }
  next();
}
