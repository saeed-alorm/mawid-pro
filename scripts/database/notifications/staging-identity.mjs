import { boundedJson } from "./bounded-json.mjs";

const pool =
  "//iam.googleapis.com/projects/104578849291/locations/global/workloadIdentityPools/mawid-staging-fcm";
const audience = `${pool}/providers/fcm-sender-x509`;
const account = "mawid-staging-fcm@mawid-development.iam.gserviceaccount.com";
const accessTokenType = "urn:ietf:params:oauth:token-type:access_token";
const usable = (value) => typeof value === "string" && /^[A-Za-z0-9._~+/=-]{1,12288}$/.test(value);

export function x509SubjectToken(value) {
  if (typeof value !== "string" || value.length > 5120) return;
  try {
    const chain = JSON.parse(value);
    if (
      Array.isArray(chain) &&
      chain.length >= 1 &&
      chain.length <= 4 &&
      chain.every(
        (certificate) =>
          typeof certificate === "string" &&
          /^[A-Za-z0-9+/]+={0,2}$/.test(certificate) &&
          btoa(atob(certificate)) === certificate,
      )
    )
      return JSON.stringify(chain);
  } catch {
    return;
  }
}

export function stagingIdentity(certificate, subjectToken, request, now) {
  let cached;
  async function exchange(send, url, body, signal, bearer) {
    signal?.throwIfAborted();
    const headers = { "content-type": "application/json" };
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    const response = await send(url, {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      const denied = [400, 401, 403, 404].includes(response.status);
      throw Object.assign(Error("IDENTITY_UNAVAILABLE"), {
        response: { status: denied ? 403 : 503 },
      });
    }
    return boundedJson(response, 16384);
  }
  return {
    async getAccessToken(signal) {
      if (cached && cached.expires > now() + 60000) return cached.token;
      const federated = await exchange(
        (url, options) => certificate.fetch(url, options),
        "https://sts.mtls.googleapis.com/v1/token",
        {
          audience,
          subject_token: subjectToken,
          subject_token_type: "urn:ietf:params:oauth:token-type:mtls",
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          requested_token_type: accessTokenType,
          scope: "https://www.googleapis.com/auth/iam",
        },
        signal,
      );
      if (
        !usable(federated?.access_token) ||
        federated.issued_token_type !== accessTokenType ||
        typeof federated.token_type !== "string" ||
        federated.token_type.toLowerCase() !== "bearer"
      )
        throw Error("IDENTITY_UNAVAILABLE");
      const minted = await exchange(
        request,
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
        { scope: ["https://www.googleapis.com/auth/firebase.messaging"], lifetime: "600s" },
        signal,
        federated.access_token,
      );
      const expires = Math.min(Date.parse(minted?.expireTime), now() + 600000);
      if (!usable(minted?.accessToken) || !(expires > now() + 60000))
        throw Error("IDENTITY_UNAVAILABLE");
      cached = { token: minted.accessToken, expires };
      return cached.token;
    },
    invalidateAccessToken(rejected) {
      if (cached?.token === rejected) cached = undefined;
    },
  };
}
