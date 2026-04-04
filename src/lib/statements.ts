export function insertNewUser(
  db: Database,
  username: string,
  name: string = "",
  invitingUserId?: string | undefined | null
): User | undefined {
  const userId = nanoid.nanoid(5);
  db.prepare(
    "INSERT INTO users (id, username, name, enabled, referenced_by) values (:id, :username, :name, :enabled, :referenced_by)"
  ).run({
    id: userId,
    username: username,
    name: name,
    enabled: 1,
    referenced_by: invitingUserId ?? null,
  });
  return getUserById(db, userId);
}