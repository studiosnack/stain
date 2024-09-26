import path from "node:path";
import { VALIDATED_DOMAINS, PORT, MEDIA_PATH } from "../consts";

export function isValidOrigin(origin: string): Boolean {
  const testingOrigins = VALIDATED_DOMAINS ?? [`http://localhost:${PORT}`];
  return testingOrigins.includes(origin);
}

export const pathToMedia = (uri: string) => {
  return path.join(__dirname, "../", MEDIA_PATH, uri);
};