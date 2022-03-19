
-- DROP TABLE IF EXISTS media;
CREATE TABLE IF NOT EXISTS media (
  id text primary key, 
  uri text not null,
  title text,
  caption text,
  created_on text default (strftime('%s', 'now')),
  deleted_on text, 
  metadata text default '{}', -- either pulled from jpg/raw or ig
  hashtags text default '[]', -- json array of hashtag ids
  mentions text default '[]' -- json array of hashtag ids
);

-- DROP TABLE IF EXISTS posts;
CREATE TABLE IF NOT EXISTS posts (
  id text primary key,
  user text not null,
  media text,
  title text,
  caption text,
  created_on text default (strftime('%s', 'now')),
  published_on text default (strftime('%s', 'now')),
  deleted_on text,
  metadata text default '{}',   -- either pulled from jpg/raw or ig
  hashtags text default '[]', -- json array of hashtag ids
  mentions text default '[]' -- json array of hashtag ids
);


-- users are both login users and referenced users i.e. for at-mentions

-- DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (
  id text primary key,
  username text unique not null,
  name text default "",
  bio text default "",
  url text default "",
  enabled integer default 0,
  twitter_credential text,
  twitter_username text
);

-- all hashtags are stored this way for renaming, etc
-- DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS hashtags (
  id text primary key,
  name text unique not null,
  description text
);

