// __Node__ credential helpers functions for dealing with
// things like authdata from a webauthn request

import {createHash, createVerify} from 'node:crypto';

export function atou8(b64ascii: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64ascii, 'base64'));
}
export function u8toa(u8arr: Uint8Array): string {
  return Buffer.from(u8arr).toString('base64');
}

export function parseAuthData(authData: Uint8Array): {
  userPresent: boolean;
  userVerified: boolean;
  backupEligible: boolean;
  backupState: boolean;
  atPresent: boolean;
  edPresent: boolean;
  signCount: number;
  aaguid: Uint8Array;
  credentialId: Uint8Array;
  credentialIdB64: string;
} {
  // see https://w3c.github.io/webauthn/#sctn-authenticator-data
  const rpiHash = new Uint8Array(authData.buffer, 0, 32);

  const flags = authData[32];
  const [
    userPresent,
    rfu1, // Reserved for future use 1
    userVerified,
    backupEligible,
    backupState,
    rfu2, // Reserved for future use 2
    atPresent,
    edPresent,
  ] = [
    flags & 1,
    (flags >> 1) & 1,
    (flags >> 2) & 1,
    (flags >> 3) & 1,
    (flags >> 4) & 1,
    (flags >> 5) & 1,
    (flags >> 6) & 1,
    (flags >> 7) & 1,
  ].map(Boolean);

  // attested credential data starts at offset 33
  // https://w3c.github.io/webauthn/#sctn-attested-credential-data
  const signCount = new DataView(
    new Uint8Array(authData.buffer, 33, 4).buffer,
  ).getUint32(0);

  const aaguid = new Uint8Array(authData.buffer, 37, 16);
  const credentialIdLength = new DataView(authData.buffer, 53, 2).getUint16(0);

  const credentialId = new Uint8Array(authData.buffer, 55, credentialIdLength);
  const credentialIdB64 = u8toa(credentialId);

  return {
    userPresent,
    userVerified,
    backupEligible,
    backupState,
    atPresent,
    edPresent,
    signCount,
    aaguid,
    credentialId,
    credentialIdB64,
  };
}

export async function parseKey(pk: Uint8Array): Promise<CryptoKey> {
  // returns either a ecdsa or pkcs1_1.5 key
  let key;
  try {
    key = await crypto.subtle.importKey(
      'spki',
      pk,
      {name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256'},
      true,
      ['verify'],
    );
  } catch (err) {
    // maybe we didn't get an ecdsa key :(
    key = await crypto.subtle.importKey(
      'spki',
      pk,
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
      false,
      ['verify'],
    );
  }
  return key;
}

function hash256(something: Buffer): Buffer {
  const hash = createHash('sha256');
  hash.update(something);
  return hash.digest();
}

/**
 * verify a der-encoded ecdsa signature using node apis
 */
export function simpleVerifyFromKey(
  // spki: Buffer,
  key: CryptoKey,
  signature: Buffer,
  authenticatorData: Buffer,
  clientDataJson: Buffer,
): boolean {
  const data = Buffer.concat([authenticatorData, hash256(clientDataJson)]);

  const verifier = createVerify('SHA256').update(data);
  return verifier.verify(key as any, signature);
}

/**
 * Verify a webauthn signature using webcrypto apis
 */
export async function verifyAuth(
  key: CryptoKey,
  signature: Buffer,
  authenticatorData: Buffer,
  clientDataJson: Buffer,
): Promise<boolean> {
  const signedJson = await crypto.subtle.digest('SHA-256', clientDataJson);
  const signedJsonBuffer = Buffer.from(signedJson);
  const data = Buffer.concat([authenticatorData, signedJsonBuffer]);

  return crypto.subtle.verify(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
      hash: 'SHA-256',
    } as EcdsaParams,
    key,
    parseDerSignature(signature),
    data,
  );
}

/**
 * convert a der/asn.1 encoded ecdsa signature into an ieee-p1363
 * encoded one (i.e. r and s buffers are smooshed together)
 */
function parseDerSignature(buff: Buffer) {
  // DER ASN.1 keys begin with 0x30 or "ME" in base64
  if (buff[0] !== 48) {
    // probably the correct kind already!
    return buff;
  } else {
    let totalLen = buff[1];
    if (buff.length != totalLen + 2) {
      throw new Error(
        `bad der encoded signature, expected len: ${totalLen + 2} but got ${
          buff.length
        }`,
      );
    }

    let parts = [];

    for (let i = 2; i <= totalLen; i += 1) {
      let curr = buff[i];
      // '2' means "new integer"
      if (curr === 2) {
        // if the leftmost bit is set, the segment length is
        // defined using 'length octets'
        let segmentLength;
        if (((buff[i + 1] >> 7) & 1) === 1) {
          // this could happen, but it's not happening yet
          // and probably not for current key lengths for a while
          throw new Error('Need to parse indefinite r,s segments');
        } else {
          segmentLength = buff[i + 1];
        }
        let start = i + 2;
        const end = i + 2 + segmentLength;

        // trim leading 0x00s from buff by advancing the start
        // index. these 0s cause sig validation to fail otherwise.
        while (start < end && buff[start] === 0) {
          start += 1;
        }
        const slice = new Uint8Array(buff.slice(start, end))
        parts.push(slice)

        // move to next segment
        i += segmentLength;
        continue;
      }
    }

    return Buffer.concat(parts);
  }
}
