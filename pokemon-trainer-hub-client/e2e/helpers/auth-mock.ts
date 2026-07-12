import { Page } from '@playwright/test';

// Simulates a real Auth0 login end to end at the network level — no real
// Auth0 tenant call, no test-user credentials — by intercepting exactly the
// two requests the SDK itself makes (`/authorize`, `POST /oauth/token`) and
// nothing else. Verified against the installed @auth0/auth0-spa-js source
// (node_modules/@auth0/auth0-spa-js/src), not guessed:
//   - auth0-spa-js's jwt.ts `verify()` never checks the ID token's
//     cryptographic signature — only its claims (iss/aud/sub/nonce/exp) — so
//     no real keypair or JWKS mock is needed, just a well-formed JWT shape.
//   - `state` in the /authorize redirect back to /callback must exactly
//     match the `state` the SDK generated (Auth0Client.ts's
//     _handleLoginRedirectCallback throws 'Invalid state' otherwise) — both
//     `state` and `nonce` are readable directly off the intercepted
//     /authorize request's own query string, so nothing needs to be read
//     out of storage.
//   - iss must be `https://<domain>/` (trailing slash) per getTokenIssuer().

const DOMAIN = 'dev-4sn27sue6rmxl7hd.us.auth0.com';
const CLIENT_ID = 'm2CW5aCuTqDWg3hYETtWlZ56FSFOIJ1d';
const FAKE_CODE = 'e2e-fake-code';
const FAKE_ACCESS_TOKEN = 'e2e-fake-access-token';

function base64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// A structurally-valid but unsigned JWT — see the note above on why that's
// enough for auth0-spa-js's own validation.
function buildFakeIdToken(nonce: string, user: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://${DOMAIN}/`,
    aud: CLIENT_ID,
    sub: 'auth0|e2e-test-user',
    iat: now,
    exp: now + 60 * 60,
    nonce,
    ...user,
  };
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.e2e-fake-signature`;
}

export interface MockUser {
  name?: string;
  email?: string;
  nickname?: string;
  picture?: string;
}

// Registers the two route interceptions. Call once per test, before
// triggering login (e.g. before clicking "Get Started").
export async function mockAuth0Login(page: Page, user: MockUser = {}): Promise<void> {
  let capturedNonce = '';

  await page.route(`https://${DOMAIN}/authorize*`, async (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state') ?? '';
    capturedNonce = url.searchParams.get('nonce') ?? '';
    const redirectUri = url.searchParams.get('redirect_uri') ?? `${new URL(page.url()).origin}/callback`;

    await route.fulfill({
      status: 302,
      headers: { Location: `${redirectUri}?code=${FAKE_CODE}&state=${state}` },
    });
  });

  await page.route(`https://${DOMAIN}/oauth/token`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: FAKE_ACCESS_TOKEN,
        id_token: buildFakeIdToken(capturedNonce, user),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email',
      }),
    });
  });
}
