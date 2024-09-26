// runtime consts either from env or otherwise
import path from "node:path";

export const PORT = 3000;
// whether or not to validate domains (disable if you're having domain issues)
export const VALIDATE_DOMAIN = false;
// these specific domains are verified when logging in
export const VALIDATED_DOMAINS = [
  // this is just the dev domain
  `http://localhost:${PORT}`,
  // this is whatever domain you want your app hosted under
  "https://foto.generic.cx",
  // mdns here
  `http://skane.local:${PORT}`,
  "https://snaps.studiosnack.net",
];
// This domain is, if included, used to create
// backlinks to this install (i.e. in the json feed)
// otherwise, most links are generated clientside
// using the window location
export const PUBLIC_DOMAIN = "";
// How many items are returned in the default feed
export const FEED_PAGESIZE = 30;

export const SESSION_SECRET = process.env.SESSION_SECRET ?? "water in my head";

// CONSTANTS
export const VIEWS_DIR = path.join(__dirname, `/../src/views`);
export const DB_PATH = "insta.db";
export const MEDIA_PATH = "../media";

// this is weird, i admit, but it's a crude way to deal with relative media paths
export const ROOT_MEDIA_PATH = path.join(__dirname, MEDIA_PATH);

// in order to keep the fs relatively reasonable, leave originals in the o dir
// but keep copies of smaller/resized versions in separate folders
export const UPLOAD_PATH = path.join(ROOT_MEDIA_PATH, "o", "uploaded");
export const SMALL_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "s");
export const MEDIUM_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "m");
export const LARGE_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "l");
export const EXTRA_LARGE_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "xl");
