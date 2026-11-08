import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Existing Apple API credential, restricted here to the EO identifier.
const identifier = 'com.appeo.mobile';
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const input = `${encode({ alg: 'ES256', kid: process.env.ASC_API_KEY_ID, typ: 'JWT' })}.${encode({ iss: process.env.ASC_API_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
const key = createPrivateKey(readFileSync(process.env.ASC_API_KEY_PATH));
const jwt = `${input}.${sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
async function api(path, body) {
  const response = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Apple API ${response.status}: ${result.errors?.map(x => x.code).join(', ') || 'falha'}`);
  return result;
}
const bundles = await api(`bundleIds?filter[identifier]=${identifier}`);
const bundle = bundles.data?.find(x => x.attributes.identifier === identifier);
if (!bundle) throw new Error('App ID do EO não encontrado. Nenhum outro aplicativo foi alterado.');
const capabilities = await api(`bundleIds/${bundle.id}/bundleIdCapabilities?limit=200`);
if (!capabilities.data?.some(x => x.attributes.capabilityType === 'PUSH_NOTIFICATIONS')) {
  await api('bundleIdCapabilities', { data: {
    type: 'bundleIdCapabilities', attributes: { capabilityType: 'PUSH_NOTIFICATIONS' },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } },
  } });
}
console.log('Push Notifications confirmado na Apple somente para com.appeo.mobile.');
