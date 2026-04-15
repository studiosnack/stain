import nanoid from "nanoid";
import type { User } from './models';
import db from '../db';

export const insertUserStmt = db.prepare<{
  id: string;
  username: string;
  name: string;
  enabled: 1 | 0;
  referenced_by: string | undefined | null;
}>(
  `INSERT INTO users (
    id, 
    username, 
    name, 
    enabled, 
    referenced_by
  ) VALUES (
    :id, :username, :name, :enabled, :referenced_by
  )`
);

export const selectUserByIdStmt = db.prepare<{ 
  userId: string 
}, User>(`SELECT * from users where id = $userId`)



export function insertNewUser(
  username: string,
  name: string = "",
  invitingUserId?: string | undefined | null
): User | undefined {
  const userId = nanoid.nanoid(5);
  insertUserStmt.run({
    id: userId,
    username: username,
    name: name,
    enabled: 1,
    referenced_by: invitingUserId ?? null,
  });
  return selectUserByIdStmt.get({userId});
}