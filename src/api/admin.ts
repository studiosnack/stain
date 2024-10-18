import express, {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";

import invariant from "../lib/mini-invariant";
import { withDbMiddleware, withUserMiddleware } from "../middleware";
import * as models from "../lib/models";

const app = express.Router();

app.use((req, res, next) => {
  console.log("got a hit for", req.path);
  next();
});

app.post(
  "/invite",
  withUserMiddleware,
  async (req: ExpressRequest, res: ExpressResponse) => {
    if (req.user?.id == null) {
      return res.status(403).send("hc svnt dracones");
    }
    invariant(req.db, "can't access user without db");

    const userToInvite = await models.getUserById(req.db, req.body.userId);
    if (!userToInvite) {
      return res.status(400).send("qvo vadis?");
    }

    console.log(
      `${req.user.username} (${req.user.id}) inviting referenced user ${userToInvite?.username} (${userToInvite?.id})`
    );
    const invite = await models.createInviteForUser(
      req.db,
      userToInvite.id,
      req.user.id
    );
    res.redirect("/");
    return;
  }
);

app.post(
  "/enable",
  withUserMiddleware,
  async (req: ExpressRequest, res: ExpressResponse) => {
    if (req.user?.id == null) {
      return res.status(403).send("hc svnt dracones");
    }
    invariant(req.db, "can't access user without db");

    const userToPromote = await models.getUserById(req.db, req.body.userId);
    if (!userToPromote) {
      return res.status(400).send("qvo vadis?");
    }
    console.log(
      `${req.user.username} (${req.user.id}) attempting to promote referenced user ${userToPromote?.username} (${userToPromote?.id})`
    );
    try {
      await req.db.run(`UPDATE users set enabled = 1 where id = :enabledId`, {
        ":enabledId": userToPromote?.id,
      });
    } catch (err) {
      res.status(500).send("ista qvidem vis est!");
    }
    res.redirect("/");
  }
);

app.post(
  "/username",
  withUserMiddleware,

  async (req: ExpressRequest, res: ExpressResponse) => {
    invariant(req.db, "can't access user without db");

    if (req.user?.id != null) {
      const oldUsername = req.user.username;
      const newUsername = req.body.updated_un;
      const newUser = await models.updateUsername(
        req.db,
        req.user.id,
        newUsername
      );
      console.log(
        `updated username ${oldUsername}(${req.user.id}) -> ${newUsername}`
      );

      res.redirect("/");
      return;
    } else {
      res.status(403).send("hc svnt dracones").end();
      return;
    }

    res.redirect("/");
  }
);

app.post(
  "/name",
  withUserMiddleware,

  async (req: ExpressRequest, res: ExpressResponse) => {
    invariant(req.db, "can't access user without db");

    if (req.user?.id != null) {
      const oldUsername = req.user.username;
      const newUsername = req.body.updated_cn;
      const newUser = await models.updateName(req.db, req.user.id, newUsername);
      console.log(`updated user's name from ${oldUsername} to ${newUsername}`);

      res.redirect("/");
      return;
    } else {
      res.status(403).send("hc svnt dracones").end();
      return;
    }

    res.redirect("/");
  }
);

export { app };
