# insta

a minimal self-hosted photo backup/sharing app.

the idea here is to have something that allows for the following features:

- individual or multiple photos can be shared, with comments, with tags, and user mentions.

- users... exist, auth is mobile-oriented, supports passkeys and user/password.

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
- build the webserver `yarn build:watch`
- run the webserver `find dist | entr -r node dist/server.js`
