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

in macos, i find that heif support is really weird to get working correctly, i sometimes have a build that works and sometimes i don't, i'm not patient enough to debug it.

## running

the way i run this, inadvisedly, is to have a copy of this repo on a vps. i pull latest from github, i build it using yarn build:prod and then i run it via systemd.

in particular, the most important parts of the systemd job are these

```
[Service]
ExecReload=/bin/kill $MAINPID
KillMode=control-group
Restart=on-failure

Environment=SESSION_SECRET="something different here"
Environment=NODE_ENV=production

; (this is just the git root)
WorkingDirectory=/home/projects/stain
; i run node via volta from the git root directly running dist/server.js
ExecStart=/home/projects/.volta/bin/node dist/server.js
```

there are some flaws here, but

## env file

in dev, you can run with most parametrizable settings set by running

```sh
find dist | entr -r node --env-file .env.dev  dist/server.js
```

## docker

i'm still soured on docker so a lot of this is kicking and screaming

### development

the idea is that we have a series of root mount points:
/media - where the media lives
/db - wherever the db sqlite file lives

**building sharp** in order for this whole docker thing to work, i need to build sharp using a really beefy image but i don't want to ship that. that image installs a ton of tooling so that i can effectively generate custom linked sharp packages. in order to do that, node:alpine needs:

```
build-base vips vips-heif vips-jxl libheif vips-dev
```

and you need a package.json with

```
node-addon-api node-gyp sharp
```

simply installing all those with all the build reqs will cause sharp to build itself correctly.

**preparing** i have a node-alpine image i have built
that installs a little bit extra for the purposes of getting heif support working, it looks like this:

i call this image 'node-vips' and it's really not clear whether or not i gain anything from using it instead of just using this at the top of my real dockerfile...
```Dockerfile
FROM node:20-alpine

RUN apk add \
  vips vips-cpp vips-heif vips-jxl \
  libheif libde265 libdav1d libavif

CMD node
```

**building** i use this to build the local instance. take a look at the dockerfile to see what is set here
```sh
docker build --no-cache -t satin:2.0 --platform linux/amd64 .
```

if using orbstack to dev, you can run like this using orbstack volumes. the benefit on a mac at least of using orbstack is that you get the https proxy 'for free' and you get a nice-ish ui for interacting with the volumes for db/media, but i mean, you don't need to use it, docker will do just fine you just want to make sure that the first validated domain on the list is the one you intend to use to access the instance:

**running** this is what i use to run the instance

```shell
npm run via:orbstack
```

which is shorthand for the following:

```shell
docker run -it --rm \
  -v media:/media -v db:/db \
  -p 3000:3000 \
  --env DB_ROOT="/db" \
  --env VALIDATED_DOMAINS="https://loco.orb.local http://localhost:3000" \
  --platform linux/amd64 \
  --name loco 
  satin:2.0
```
