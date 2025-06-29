// runtime consts either from env or otherwise
import path from "node:path";

function boolFromEnvString(
  val: string | undefined,
  backup: boolean = false
): Boolean | undefined {
  if (val === undefined) {
    return undefined;
  }
  val = val?.trim() ?? "";
  return val === "true"
    ? true
    : val === "false"
    ? false
    : val === ""
    ? undefined
    : true;
}

function numberFromEnvString(
  val: string | undefined,
  backup: number | undefined = undefined
): number | undefined {
  val = val?.trim();
  if (String(Number(val)) === val?.trim()) {
    return Number(val);
  }
  return undefined;
}

function arrayFromEnvString(val: string | undefined): string[] | undefined {
  if (val === undefined) {
    return undefined;
  }
  return val
    .trim()
    .split(" ")
    .filter((el) => el !== "");
}

function pathFromEnvString(val: string | undefined): string | undefined {
  if (val === undefined) {
    return undefined;
  } else if (val.startsWith("/")) {
    return val;
  } else {
    return path.join(__dirname, val);
  }
}

export const PORT = numberFromEnvString(process.env.PORT) ?? 3_000;
// whether or not to validate domains (disable if you're having domain issues)
export const VALIDATE_DOMAIN =
  boolFromEnvString(process.env.VALIDATE_DOMAIN) ?? false;
// these specific domains are verified when logging in
export const VALIDATED_DOMAINS = arrayFromEnvString(
  process.env.VALIDATED_DOMAINS
) ?? [
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
export const VIEWS_DIR =
  pathFromEnvString(process.env.VIEWS_DIR) ?? path.join(__dirname, `/views`);
export const DB_PATH = pathFromEnvString(process.env.DB_PATH) ?? "insta.db";

// you should only set this relative to the build server
// the current value is relative to dist
const relative_media_path = "../media";
// this is weird, i admit, but it's a crude way to deal with relative media paths
export const ROOT_MEDIA_PATH =
  pathFromEnvString(process.env.ROOT_MEDIA_PATH) ??
  path.join(__dirname, relative_media_path);

// in order to keep the fs relatively reasonable, leave originals in the o dir
// but keep copies of smaller/resized versions in separate folders
export const UPLOAD_PATH = path.join(ROOT_MEDIA_PATH, "o", "uploaded");
export const SMALL_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "s");
export const MEDIUM_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "m");
export const LARGE_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "l");
export const EXTRA_LARGE_RESIZE_PATH = path.join(ROOT_MEDIA_PATH, "xl");
