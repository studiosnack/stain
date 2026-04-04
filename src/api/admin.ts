import express, {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";

import invariant from "../lib/mini-invariant";
import { withUserMiddleware } from "../middleware";
import * as models from "../lib/models";

const app = express.Router();

/*
  these admin routes are entirely for logged in users
 */

app.use((req, _res, next) => {
  console.log("got a hit for", req.path);
  next();
});

const requiresLoggedInUser = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (req.user?.id == null) {
    res.status(403).send("hc svnt dracones");
    return
  }
  return next();
}

app.post(
  "/invite",
  withUserMiddleware,
  requiresLoggedInUser,
  async (req: ExpressRequest, res: ExpressResponse) => {
    invariant(req.db, "can't access user without db");

    const userToInvite = models.getUserById(req.db, req.body.userId);
    if (!userToInvite) {
      res.status(400).send("qvo vadis?");
      return
    }

    console.log(
      `${req.user.username} (${req.user.id}) inviting referenced user ${userToInvite?.username} (${userToInvite?.id})`
    );
    models.createInviteForUser(req.db, userToInvite.id, req.user.id);
    res.redirect("/");
  }
);

app.post(
  "/enable",
  withUserMiddleware,
  requiresLoggedInUser,
  async (req: ExpressRequest, res: ExpressResponse) => {
    invariant(req.db, "can't access user without db");

    const userToPromote = models.getUserById(req.db, req.body.userId);
    if (!userToPromote) {
      res.status(400).send("qvo vadis?");
      return
    }
    console.log(
      `${req.user.username} (${req.user.id}) attempting to promote referenced user ${userToPromote?.username} (${userToPromote?.id})`
    );
    try {
      req.db.prepare(`UPDATE users set enabled = 1 where id = :enabledId`).run({
        ":enabledId": userToPromote?.id,
      });
    } catch (err) {
      res.status(500).send("ista qvidem vis est!");
      return;
    }
    res.redirect("/");
    return
  }
);

app.post(
  "/username",
  withUserMiddleware,
  requiresLoggedInUser,
  async (req: ExpressRequest, res: ExpressResponse) => {
    invariant(req.db, "can't access user without db");

    const oldUsername = req.user.username;
    const newUsername = req.body.updated_un;
    const newUser = models.updateUsername(req.db, req.user.id, newUsername);
    console.log(
      `updated username ${oldUsername}(${req.user.id}) -> ${newUsername}`
    );

    res.redirect("/");
    return;
  }
);

app.post(
  "/name",
  withUserMiddleware,

  async (req: ExpressRequest, res: ExpressResponse) => {
    invariant(req.db, "can't access user without db");

    const oldUsername = req.user.username;
    const newUsername = req.body.updated_cn;
    const newUser = models.updateName(req.db, req.user.id, newUsername);
    if (newUser) {
      console.log(
        `updated user's name from ${oldUsername} to ${newUser.name}`
      );
      res.redirect("/");
    }

    return;
  }
);

export { app };
