'use strict';
/**
 * Federation token verification — local, via the Federation's JWKS.
 *
 * Social accepts identity tokens whose `aud` includes 'concordia:social'.
 * Server-scoped tokens (aud = a chat server origin) are rejected, so a
 * malicious chat server can no longer harvest a token and read DMs — the
 * flaw this replaces (shared JWT_SECRET verification accepted any
 * Federation-signed token).
 */
const { createRemoteJWKSet, jwtVerify } = require('jose');

const FEDERATION_URL = process.env.FEDERATION_URL || 'https://federation.concordiachat.com';

function normalizeOrigin(input) {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withScheme).origin.toLowerCase();
}

const FEDERATION_ORIGIN = normalizeOrigin(FEDERATION_URL);

const JWKS = createRemoteJWKSet(
  new URL(`${FEDERATION_ORIGIN}/.well-known/jwks.json`),
  { cooldownDuration: 30_000, cacheMaxAge: 600_000 }
);

/**
 * Verifies an identity token. Returns the payload (throws on any failure).
 */
async function verifySocialToken(token) {
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ['EdDSA'],
    audience: 'concordia:social',
    issuer: FEDERATION_ORIGIN,
  });
  return payload;
}

module.exports = { verifySocialToken };
