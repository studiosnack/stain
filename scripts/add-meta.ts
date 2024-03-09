import { Database } from "sqlite3";
import { open } from "sqlite";
import {inspect} from 'util'

const fs = require('fs');
const exifReader = require('exif-reader')
const sharp = require('sharp')

const DB_PATH = "insta.db";
const ARCHIVE_PATH = "archives/nsfmc_20211226"
// this is a top-level await
// open the database

type RawMediaType = {
  id: string;
  uri: string;
  title?: string;
  caption?: string;
  created_on: string;
  deleted_on?: string;
  metadata: string;
  hashtags: string;
  mentions: string;
};

type Media = {
  id: string;
  uri: string;
  title?: string;
  caption?: string;
  created_on: Date;
  deleted_on?: Date;
  metadata: {[key: string]: any};
  hashtags: string[];
  mentions: string[];
};

const parseMedia = (media: RawMediaType): Media => {
  return {...media,
    created_on: new Date(Number(media.created_on)),
    deleted_on: media.deleted_on ? new Date(Number(media.deleted_on)) : undefined,
    metadata: JSON.parse(media.metadata),
    hashtags: JSON.parse(media.hashtags),
    mentions: JSON.parse(media.mentions)
  }
}

const main = async () => {
  const db = await open({
    filename: DB_PATH,
    driver: Database,
  });

  const media = await db.all<RawMediaType[]>("select * from media");
  const getMeta = (uri: string) => {
    return new Promise((res, rej) => {
      if (uri.endsWith('mp4')) {
        res({})
        return
      }

      (async () => {
        let meta;
        try {
          meta = await sharp(uri).metadata()
        } catch(err) {
          rej(err)
        }
        if(!meta) {
          console.warn('wtf', uri)
          res({})
        }
        if (meta?.exif) {
          const exif_data = await exifReader(meta.exif);
          res({photo_metadata: {...meta, exif_data}})
          return;
        }
        res({photo_metadata: meta})
      })()

      // fs.open(uri, 'r', undefined, (err, fd) => {
      //   fs.read(fd, async (err, bytes, buf) => {
      //     let meta;
      //     try {
      //       meta = await sharp(buf).metadata()
      //     } catch(err) {
      //       rej(err)
      //     }
      //     if(!meta) {
      //       console.warn('wtf', uri)
      //       res({})
      //     }
      //     if (meta?.exif) {
      //       const exif_data = await exifReader(meta.exif);
      //       res({photo_metadata: {...meta, exif_data}})
      //       return;
      //     }
      //     res({photo_metadata: meta})
      //   })
      // });
    })
  }

  for (const thing of media) {
    const medium = parseMedia(thing)
    if (Object.keys(medium.metadata).length === 0) {
      console.log(`! empty meta for ${medium.id} (${medium.uri})`)

      try {
        const meta = await getMeta(`${ARCHIVE_PATH}/${medium.uri}`);
        console.log(`!-- metadata for media ${medium.id}`, meta)
        // pass
      } catch(err) {
        console.error(`error opening ${`${ARCHIVE_PATH}/${medium.uri}`}`);
        console.error(err)
      }

    } else {
      console.log(`+ found existing metadata for medium ${medium.id}`,
        inspect(medium.metadata, {depth: null})
      );
      try {
        const meta = await getMeta(`${ARCHIVE_PATH}/${medium.uri}`);
        console.log(`? parsed metadata for media ${medium.id}`, inspect(meta, {depth: null}));

      } catch(err) {
        console.error(`error opening ${`${ARCHIVE_PATH}/${medium.uri}`}`);
        console.error(err)
      }

    }
  }
};

main();
