# stain (satin?)

a minimal self-hosted photo backup/sharing app for antisocial people.

- by default all public images have exif data stripped
- all images except for homepage are served in original aspect ratio
- images are served/reformatted in modern formats with high quality (i.e. you upload a heic and your browser will get that or maybe a webp).
- only logged in users can access original files
- opengraph support for sharing individual posts over text
- by default, copying the url shares what you see (except user homepage, for now)
- share first, format later
- similarly: almost all actions can be deferred

the idea here is to have something that allows for the following features:

- individual or multiple photos can be shared as a single post, with per-photo captions, tags, and user mentions, maybe location data in some nebulous way.

- users... exist, auth is mobile-oriented, supports passkeys only.

### privacy

- it would be nice to support complex permissions, but we do need to support at the very least:
  - only me
  - only logged in
  - public
- this setting is
  - a user-level setting (defaults)
  - a per-post setting (overrides)
- changing the default setting will
  - affect permissions of photos with no override permissions set
- setting a user's _page_ to be be private will 404 it
- setting a photo to be private will also 404 it, but will retain the media id?
- setting an individual photo be private
- idea: invalidating media ids based on privacy levels
  - ideal way to do this is have a stable media id and a public id which can be either per-invite or per-guest? we can generate an arbitrary number of these and

## users

this is basically designed around a single person or family, i haven't given much thought to how migration off would work, but the general idea is

- user a sets up an instance, uploads photos, and can tag people
- user can invite people, either people they have tagged already, or just random people.
- if the user has already been tagged, once they accept the invite, they can rename themselves.

## misc

- login only happens via passkeys
  - more about node passkey stuff here https://gist.github.com/nsfmc/d74993d49126fdfc5f8c51a012126675
- support ingesting instagram json

## admin

- this is a sort of hokey app, it builds with swc

## dev

- build the webserver `yarn build:watch`
- run the webserver `find dist | entr -r node dist/server.js`
