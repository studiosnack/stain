
-- DROP TABLE IF EXISTS media;
CREATE TABLE IF NOT EXISTS media (
  id text primary key,
  user_id text not null references users(id), -- who created this media
  uri text not null,
  title text,
  caption text,

  source text, -- currently just 'instagram'

  created_on text default (strftime('%s', 'now')),
  deleted_on text, 

  metadata text default '{}', -- either pulled from jpg/raw or ig
  content_type text default 'image/jpeg', -- the content type of this media

  hashtags text default '[]', -- json array of hashtag ids
  mentions text default '[]' -- json array of hashtag ids
);

-- DROP TABLE IF EXISTS file_meta
CREATE TABLE IF NOT EXISTS file_meta (
  media_id references media(id),
  sharp_metadata text default '{}',
  metadata_version integer default 1,
  UNIQUE (media_id, metadata_version)
);

-- DROP TABLE IF EXISTS posts;
CREATE TABLE IF NOT EXISTS posts (
  id text primary key,
  user_id text not null,
  media text,
  title text,
  caption text,
  created_on text default (strftime('%s', 'now')),
  published_on text default (strftime('%s', 'now')),
  deleted_on text,
  metadata text default '{}',   -- either pulled from jpg/raw or ig
  hashtags text default '[]', -- json array of hashtag ids
  mentions text default '[]', -- json array of mention ids
  location text -- a fkey to a location 
);


-- users are both login users and referenced users i.e. for at-mentions

-- DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (
  id text primary key,
  username text unique not null,
  name text default "",
  bio text default "",
  url text default "",
  referenced_by text default null references users(id), -- null is the first user, all other users are either invited or referenced
  enabled integer default 0,
  passkey_id blob default (randomblob(16))
);

CREATE TABLE passkeys (
  id BLOB PRIMARY KEY,
  username STRING NOT NULL,
  public_key_spki BLOB,
  backed_up BOOLEAN,
  FOREIGN KEY(username) REFERENCES users(username));

CREATE TABLE IF NOT EXISTS invites (
  id integer primary key, -- the id of the invite
  recipient_id text null REFERENCES users(id), -- the user id who got the code
  sender_id text null, -- null if system/root, otherwise a uid
  code text not null, -- the code, a nanoid
  created_on text default (strftime('%s', 'now')),
  activated_on text,
  expires_on text,
  deleted_on text
);

-- all hashtags are stored this way for renaming, etc
-- DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS hashtags (
  id text primary key,
  name text unique not null,
  description text
);

CREATE TABLE IF NOT EXISTS locations (
  id text primary key,
  lat string, -- both strings because... why not?
  lon string,
  name text unique not null,
  description text
);

