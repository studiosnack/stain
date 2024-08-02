const form = document.getElementById("signupform") as HTMLFormElement | void;

const signupHandler = async (evt: SubmitEvent) => {
  evt.preventDefault();

  const currentForm = evt.currentTarget as HTMLFormElement;
  if (!currentForm) {
    throw new Error("cannot signup without a form");
  }
  const fd = new FormData(currentForm);

  const usePassKey = await canCreateWithPassKey();
  const createOptions = getPassKeyOptions(
    fd.get("passkey_id") as string,
    fd.get("username") as string,
    fd.get("name") as string,
    JSON.parse(fd.get("existing_credentials") as string).map((cred) => ({
      ...cred,
      id: atou8(cred.id),
    }))
  );

  let cred: PublicKeyCredential | null = null;

  try {
    cred = (await navigator.credentials.create(
      createOptions
    )) as PublicKeyCredential;
  } catch (err) {
    console.log("failed or somehow already made credentials");
    if (err instanceof DOMException) {
      switch (err.name) {
        case "InvalidStateError":
          console.error("InvalidStateError");
          return;

        case "NotAllowedError":
          console.error("NotAllowedError");
          return;
      }
    }
  }

  if (cred == null) {
    console.error("cannot register with a null credential");
    return;
  }
  const cdj = JSON.parse(
    new TextDecoder().decode(cred.response.clientDataJSON)
  );

  const resp = cred.response as AuthenticatorAttestationResponse;
  const authData = new Uint8Array(resp.getAuthenticatorData());
  const pubKey = new Uint8Array(resp.getPublicKey() ?? []);

  // TODO deal with null pubkey/authdata here, not sure how
  // that happens, but still...

  fd.append("authdata", u8toa(authData));
  fd.append("pubkey", u8toa(pubKey));

  if (
    cdj.type != "webauthn.create" ||
    ("crossOrigin" in cdj && cdj.crossOrigin) ||
    cdj.origin !== window.location.origin
  ) {
    // handle error
    console.error("oops, bad passkey made");
  } else {
    await fetch(currentForm.action, {
      method: "POST",
      body: fd,
    });

    window.location.replace("/");
  }
};

// authData here is a Uint8Array
function parseAuthData(authData: Uint8Array) {
  // see https://w3c.github.io/webauthn/#sctn-authenticator-data
  const rpiHash = new Uint8Array(authData.buffer, 0, 32);

  const flags = authData[32];
  const [
    userPresent,
    rfu1,
    userVerified,
    backupEligible,
    backupState,
    rfu2,
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
  ];

  // attested credential data starts at offset 33
  // https://w3c.github.io/webauthn/#sctn-attested-credential-data
  const signCount = new DataView(
    new Uint8Array(authData.buffer, 33, 4).buffer
  ).getUint32();

  const aaguid = new Uint8Array(authData.buffer, 37, 16);
  const credentialIdLength = new DataView(authData.buffer, 53, 2).getUint16();

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
// @ts-ignore
const atou8 = (b64ascii: string): Uint8Array =>
  Uint8Array.from(atob(b64ascii), (c) => c.charCodeAt(0));
// @ts-ignore
const u8toa = (u8arr: Uint8Array): string =>
  btoa(Array.from(u8arr, (c) => String.fromCharCode(c)).join(""));

const disableSignupIfNecessary = async () => {
  const canSignup = await canCreateWithPassKey();
  if (form == null) {
    return;
  }
  if (!canSignup) {
    form.elements.submit.disabled = true;
    form.elements.submit.value =
      "need to sign up with either chrome or ios 16+";
  }
};

async function canCreateWithPassKey() {
  if (
    !window.PublicKeyCredential ||
    !PublicKeyCredential.isConditionalMediationAvailable
  ) {
    return false;
  }

  return Promise.all([
    PublicKeyCredential.isConditionalMediationAvailable(),
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
  ]).then((values) => {
    return values.every((x) => x === true);
  });
}

const getPassKeyOptions = (
  uidB64: string,
  username: string,
  displayName: string = "",
  excludeCredentials: PublicKeyCredentialDescriptor[] = []
): CredentialCreationOptions => {
  // const atou8 = (ascii: string) =>
  //   Uint8Array.from(atob(ascii), (c) => c.charCodeAt(0));
  return {
    publicKey: {
      rp: {
        // The RP ID.
        id: undefined, // use default (hostname)
        // This field is required to be set to something, but you can
        // ignore it.
        name: "",
      },

      user: {
        // `userIdBase64` is the user's passkey ID, from the database,
        // base64-encoded.
        id: atou8(uidB64),
        // `username` is the user's username. Whatever they would type
        // when signing in with a password.
        name: username,
        // `displayName` can be a more human name for the user, or
        // just leave it blank.
        displayName,
      },

      // This lists the ids of the user's existing credentials. I.e.
      //   SELECT id FROM passkeys WHERE username = ?
      // and supply the resulting list of values, base64-encoded, as
      // existingCredentialIdsBase64 here.
      excludeCredentials,

      // Boilerplate that advertises support for P-256 ECDSA and RSA
      // PKCS#1v1.5. Supporting these key types results in universal
      // coverage so far.
      pubKeyCredParams: [
        {
          type: "public-key",
          alg: -7,
        },
        {
          type: "public-key",
          alg: -257,
        },
      ],

      // Unused during registrations, except in some enterprise
      // deployments. But don't do this during sign-in!
      challenge: new Uint8Array([0]),

      authenticatorSelection: {
        authenticatorAttachment: "platform",
        requireResidentKey: true,
      },

      // Three minutes.
      timeout: 180000,
    },
  };
};

form?.addEventListener("submit", signupHandler);
disableSignupIfNecessary();
