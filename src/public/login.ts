// @ts-ignore
const u8toa = (u8arr: Uint8Array): string =>
  btoa(Array.from(u8arr, (c) => String.fromCharCode(c)).join(""));

//@ts-ignore
const atou8 = (b64ascii) =>
  Uint8Array.from(atob(b64ascii), (c) => c.charCodeAt(0));

// these anys are just because isConditionalMediationAvailable
// is not (yet) in the ts dom types
function beginRequest() {
  if (
    !window.PublicKeyCredential ||
    !(PublicKeyCredential as any).isConditionalMediationAvailable
  ) {
    return;
  }

  (PublicKeyCredential as any)
    // .isConditionalMediationAvailable()
    .isUserVerifyingPlatformAuthenticatorAvailable()
    .then((result: boolean) => {
      if (!result) {
        return;
        console.log("can't login with passkey");
      }

      startConditionalRequest();
    });
}

declare interface Window {
  ascii_challenge?: string;
}

async function startConditionalRequest() {
  // debugger;
  if (window.ascii_challenge == null) {
    // fetch a challenge i guess?
    // await some fetch...
  } else if (
    !window.PublicKeyCredential ||
    !(PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable
  ) {
    return;
  } else {
    return actuallyStartConditionalRequestWithChallenge(
      atou8(window.ascii_challenge as string)
    );
  }
}

async function actuallyStartConditionalRequestWithChallenge(
  challenge: Uint8Array
) {
  let getOptions: CredentialRequestOptions = {
    // the options here, silent, optional, etc are sort of identical in practice
    // the browser just attempts to re-auth each time
    mediation: "silent" as CredentialMediationRequirement,

    publicKey: {
      challenge,

      rpId: undefined, // SAME_AS_YOU_USED_FOR_REGISTRATION,
    },
  };
  try {
    const cred = (await navigator.credentials.get(
      getOptions
    )) as PublicKeyCredential;

    const { response, rawId } = cred;
    const { authenticatorData, clientDataJSON, signature } =
      response as AuthenticatorAssertionResponse;

    const fd = new FormData();
    fd.append("rawId", u8toa(new Uint8Array(rawId)));
    fd.append("authenticatorData", u8toa(new Uint8Array(authenticatorData)));
    fd.append("signature", u8toa(new Uint8Array(signature)));
    fd.append("clientDataJSON", u8toa(new Uint8Array(clientDataJSON)));

    try {
      const res = await fetch("/login", {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        window.location.replace("/");
      }
    } catch (err) {
      console.error("looks like login failed");
      console.error(err);
    }
  } catch (err) {
    console.error("error in credential");
    console.error(err);
  }
}

document.getElementById("login_button")?.addEventListener("click", (evt) => {
  evt.stopPropagation();
  evt.preventDefault();
  startConditionalRequest();
});
