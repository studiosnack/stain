FROM node-vips:latest

RUN mkdir /app
WORKDIR /app

COPY package.json prod.config.json tsconfig.json .swcrc .
COPY packages packages
COPY src src

RUN npm pkg set dependencies.sharp="file:./packages/sharp-0.34.2.tgz" \
  dependencies.@img/sharp-linuxmusl-x64="file:./packages/img-sharp-linuxmusl-x64-0.34.2.tgz"\
  dependencies.@img/sharp-libvips-linuxmusl-x64="file:./packages/img-sharp-libvips-linuxmusl-x64-1.1.0.tgz"

RUN npm install --omit=dev
RUN npm run build:prod

# this is the default and it's possible you might
# override this, but i assume this won't change
ENV PORT=3000
EXPOSE 3000
ENV VIEWS_DIR=/app/dist/views

# These should all probably be changed for actual deployments
ENV NODE_ENV=development
ENV VALIDATE_DOMAINS=false
ENV VALIDATED_DOMAINS="http://localhost:3000"
# these two should be mount paths, but you can probably
# in dev, you should use DB_PATH
ENV DB_ROOT=/app
ENV DB_NAME=satin.db
# until external hosting is supported, this should be a
# durable mount point with plenty of space available
ENV ROOT_MEDIA_PATH=/media

CMD ["node", "--env-file-if-exists", ".env", "dist/server.js"]