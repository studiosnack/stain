import * as fsSync from "node:fs";
import path from "node:path";

import { VALIDATED_DOMAINS } from "./consts";
import db from './db';
import {insertNewUser, createInviteForUser} from './lib/models'

/**
 * if a db is created by the server when starting up, we run this
 * function to 
 * - bootstrap the tables,
 * - insert a first user
 * - show the signup url
 */
export function initializeDb() {

  console.log("running database bootstrap")
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
      console.log(`-> Complete signup at ${VALIDATED_DOMAINS[0]}/signup/${newInvite.code}`)
    }
  }

}

