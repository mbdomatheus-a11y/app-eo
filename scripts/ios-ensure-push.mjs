import {
  appleApiUrl,
  appleApiError,
  ensureEoPush,
} from "./apple-push-capability.mjs";
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

// Existing Apple API credential, restricted here to the EO identifier.
const now = Math.floor(Date.now() / 1000);
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const input = `${encode({ alg: "ES256", kid: process.env.ASC_API_KEY_ID, typ: "JWT" })}.${encode({ iss: process.env.ASC_API_ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })}`;
const key = createPrivateKey(readFileSync(process.env.ASC_API_KEY_PATH));
const jwt = `${input}.${sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
async function api(path, body) {
  const response = await fetch(appleApiUrl(path), {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw appleApiError(response.status, path, result);
  return result;
}
await ensureEoPush(api);
console.log(
  "Push Notifications confirmado na Apple somente para com.appeo.mobile.",
);
