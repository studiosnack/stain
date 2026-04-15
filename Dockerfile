FROM node:26-alpine3.24

RUN apk add --no-cache \
  vips vips-cpp vips-heif vips-jxl \
  libheif libheif-x265 libheif-aom \
  libde265 libdav1d libavif

RUN mkdir /app
WORKDIR /app

COPY package.json prod.config.json tsconfig.json .swcrc .
COPY packages packages
COPY src src

# overrides for local sharp in particular, prevents
# post install script on locally built version
RUN npm pkg set \
  dependencies.sharp="./packages/sharp-0.34.5.tgz" \
  overrides.sharp.scripts={}

RUN npm install --omit=dev

# try to load sharp and encode a small image to verify it works
RUN node -e "require('sharp')({create:{width:16,height:16,channels:3,background:'red'}}).heif({compression:'hevc'}).toBuffer().then(()=>console.log('heic encode ok'))"

RUN npm run build:prod

# this is the default and it's possible you might
# override this, but i assume this won't change
ENV PORT=3000
EXPOSE 3000
ENV VIEWS_DIR=/app/dist/views

# These should all probably be changed for actual deployments
ENV NODE_ENV=development
ENV VALIDATE_DOMAIN=false
ENV VALIDATED_DOMAINS="http://localhost:3000"
# these two should be mount paths, but you can probably
# in dev, you should use DB_PATH
ENV DB_ROOT=/app
ENV DB_NAME=satin.db
# until external hosting is supported, this should be a
# durable mount point with plenty of space available
ENV ROOT_MEDIA_PATH=/media

CMD ["node", "--env-file-if-exists", ".env", "dist/server.js"]
