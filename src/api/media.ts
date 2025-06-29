import * as fsSync from "node:fs";
import path from "node:path";

import express from "express";
import { type Media } from "../lib/models";

import {
  EXTRA_LARGE_RESIZE_PATH,
  LARGE_RESIZE_PATH,
  MEDIUM_RESIZE_PATH,
  SMALL_RESIZE_PATH,
} from "../consts";

import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";
import sharp from "sharp";

import * as models from "../lib/models";
import invariant from "../lib/mini-invariant";
import { pathToMedia } from "../lib/utils";

import { withUserMiddleware, withDbMiddleware } from "../middleware";

declare module "express-serve-static-core" {
  interface Request {
    media?: Media;
    resizedMediaPath?: string;
  }
}

const app = express.Router();

app.use(withDbMiddleware);

// guarantees that a :media_id exists, both
async function backingMediaPresentMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) {
  invariant(req.db, "database missing");
  invariant(req.params.media_id, "can't check for media without id");

  const media = await models.getMediaById(req.db, req.params.media_id);

  if (media) {
    const mediapath = pathToMedia(media.uri);
    const mediaExistsAtPath = fsSync.statSync(mediapath, {
      throwIfNoEntry: false,
    });

    if (!mediaExistsAtPath) {
      return res.status(404).send(`maiores desvnt: ${mediapath}`);
    }
    next();
  } else {
    return res.status(404).send("hc svnt dracones");
  }
}

/**
  given a root image path and a set of acceptable content types, serve the static asset matching the path's media_id if it's present
 */
function cachedStaticAssetIfPresentMiddleware(
  imagePath: string,
  mediaFormats = ["heic", "webp", "jpg"]
) {
  return async function (
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
  ) {
    invariant(req.db, "database missing");

    // media is guaranteed to exist because of above
    // middleware
    const media = models.getMediaById(req.db, req.params.media_id);

    req.media = media;

    invariant(media, "can't render media without... media?");

    await models.insertOrFetchMetaFromMediaIdAtPath(
      req.db,
      req.params["media_id"],
      pathToMedia(media.uri)
    );

    const uri = media.uri.toLowerCase();

    // send mp4s outright
    if (uri.endsWith("mp4")) {
      res.sendFile(pathToMedia(media.uri));
      return;
    }

    // does the resized version exist?
    // check SMALL_RESIZE_PATH first
    const pathForResizedMedia = path.join(imagePath, media.user_id);
    const media_date = new Date(media.created_on * 1000);

    const resizedImageDir = path.join(
      pathForResizedMedia,

      `${media_date.getFullYear()}`,
      `${media_date.getMonth() + 1}`
    );
    // does a smol dir exist for image??
    const resizeDirStat = fsSync.statSync(resizedImageDir, {
      throwIfNoEntry: false,
    });
    if (!resizeDirStat?.isDirectory()) {
      // make dir
      console.log(`making directory ${resizedImageDir}`);
      fsSync.mkdirSync(resizedImageDir, { recursive: true });
    }

    const { name: imageNameNoExt } = path.parse(media.uri);

    const outputFormat = req.accepts(mediaFormats);
    console.log(`request for output format: ${outputFormat}`);
    if (!outputFormat) {
      // unacceptable!
      return res.status(406).send("ingratvm").end();
    }

    const resizedMediaPath = path.format({
      dir: resizedImageDir,
      name: imageNameNoExt,
      ext: outputFormat,
    });
    // this is the extensionless path
    req.resizedMediaPath = resizedMediaPath;

    const resizedMediaStat = fsSync.statSync(resizedMediaPath, {
      throwIfNoEntry: false,
    });
    if (resizedMediaStat?.isFile() && req.query?.force !== "1") {
      res.sendFile(resizedMediaPath, {
        headers: { "Content-Type": `image/${outputFormat}` },
      });
      return;
    }

    next();
  };
}

// GET /m/o/:media_id
// this gets the 'original' media. the idea is we have another
// set of endpoints like /m/s/:media_id that let you have smaller
// resized media etc
app.get(
  "/o/:media_id",
  withUserMiddleware,
  backingMediaPresentMiddleware,
  async (req: ExpressRequest, res: ExpressResponse) => {
    invariant(req.db, "database missing");

    invariant(req.media, "can't render media without... media?");

    // only logged in users get original media
    if (req.user?.id == null) {
      res.redirect(`/m/xl/${req.params.media_id}`);
      return;
    }

    const uri = req.media.uri.toLowerCase();

    const contentType = uri.endsWith(".heic")
      ? "image/heic"
      : uri.endsWith(".heif") || uri.endsWith(".hif")
      ? "image/heif"
      : uri.endsWith(".jpg") || uri.endsWith(".jpeg")
      ? "image/jpeg"
      : undefined;

    res.sendFile(pathToMedia(req.media.uri), {
      headers: contentType
        ? {
            "Content-Type": contentType,
            // force download here
            "Content-Disposition": "attachment",
          }
        : undefined,
    });
    return;
  }
);

app.get(
  "/s/:media_id",
  withDbMiddleware,
  backingMediaPresentMiddleware,
  cachedStaticAssetIfPresentMiddleware(SMALL_RESIZE_PATH, ["jpg"]),

  async (req, res) => {
    invariant(req.media, "can't render route without media");
    invariant(
      req.resizedMediaPath,
      "can't reformat image with nonexistent path "
    );

    await sharp(pathToMedia(req.media.uri))
      .rotate()
      .resize({ width: 1080, withoutEnlargement: true })
      .jpeg({ quality: 70, progressive: true })
      .toFile(req.resizedMediaPath);

    res.sendFile(req.resizedMediaPath, {
      headers: { "Content-Type": `image/jpeg` },
    });
    return;
  }
);

app.get(
  "/m/:media_id",
  withDbMiddleware,
  backingMediaPresentMiddleware,
  cachedStaticAssetIfPresentMiddleware(MEDIUM_RESIZE_PATH, ["jpg"]),

  async (req, res) => {
    invariant(req.media, "can't render route without media");
    invariant(
      req.resizedMediaPath,
      "can't reformat image with nonexistent path "
    );

    await sharp(pathToMedia(req.media.uri))
      .rotate()
      .resize({ width: 1080, withoutEnlargement: true })
      .jpeg({ quality: 70, progressive: true })
      .toFile(req.resizedMediaPath);

    res.sendFile(req.resizedMediaPath, {
      headers: { "Content-Type": `image/jpeg` },
    });
    return;
  }
);

app.get(
  "/l/:media_id",
  withDbMiddleware,
  backingMediaPresentMiddleware,
  cachedStaticAssetIfPresentMiddleware(LARGE_RESIZE_PATH),

  async (req, res) => {
    invariant(req.media, "can't render route without media");
    invariant(
      req.resizedMediaPath,
      "can't reformat image with nonexistent path "
    );
    const outputFormat = req.accepts(["heic", "webp", "jpg"]);

    await sharp(pathToMedia(req.media.uri))
      .rotate()
      .resize({ width: 2000, withoutEnlargement: true })
      // @ts-ignore this is a correct format
      .toFormat(outputFormat)
      .toFile(req.resizedMediaPath);

    res.sendFile(req.resizedMediaPath, {
      headers: { "Content-Type": `image/${outputFormat}` },
    });
    return;
  }
);

app.get(
  "/xl/:media_id",
  withDbMiddleware,
  backingMediaPresentMiddleware,
  cachedStaticAssetIfPresentMiddleware(EXTRA_LARGE_RESIZE_PATH),
  async (req, res) => {
    invariant(req.media, "can't render route without media");
    invariant(
      req.resizedMediaPath,
      "can't reformat image with nonexistent path "
    );
    const outputFormat = req.accepts(["heic", "webp", "jpg"]);

    console.log(`[XL]: emitting ${outputFormat}`);

    await sharp(pathToMedia(req.media.uri))
      .rotate()
      // @ts-ignore this is a correct format
      .toFormat(outputFormat)
      .toFile(req.resizedMediaPath);

    res.sendFile(req.resizedMediaPath, {
      headers: { "Content-Type": `image/${outputFormat}` },
    });
    return;
  }
);

export { app };
