// Thin wrapper around the Auth0 Management API — used only to delete the
// Auth0 user record itself when a trainer deletes their account (see
// accountService.js). Uses a separate Machine-to-Machine application
// (AUTH0_M2M_CLIENT_ID/SECRET) authorized for the Management API with only
// the `delete:users` scope — deliberately not the SPA's own client id, which
// has no Management API access at all.
//
// The domain is derived from the existing AUTH0_ISSUER_BASE_URL
// (https://<tenant>.auth0.com/) instead of a second, redundant env var that
// could drift out of sync with it.
function domain() {
  return new URL(process.env.AUTH0_ISSUER_BASE_URL).host;
}

// Module-level cache for the current Management API token — same "one
// in-memory value, no library needed" idea as pokeapi.js's cache, just for a
// single token instead of many keyed entries.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

// 60s safety buffer so a token already expired-in-flight is never used.
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

async function getManagementToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const response = await fetch(`https://${domain()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_M2M_CLIENT_ID,
      client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
      audience: `https://${domain()}/api/v2/`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth0 Management API token request failed with ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS;
  return cachedToken;
}

// Deletes the Auth0 user record itself (not just our own DB rows). Auth0
// user ids contain a literal "|" (e.g. "auth0|64f..."), so the id must be
// URL-encoded. Throws on any non-ok response — the caller (accountService)
// decides how to handle that; this function never swallows a failure.
async function deleteAuth0User(auth0UserId) {
  const token = await getManagementToken();

  const response = await fetch(`https://${domain()}/api/v2/users/${encodeURIComponent(auth0UserId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Auth0 user deletion failed with ${response.status}`);
  }
}

// Fetches fresh Auth0 profile info for one user — a genuine read, nothing
// persisted. Used by the Admin Trainer detail page's "Refresh Auth0 info"
// action (a real GET, deliberately not a POST — it doesn't mutate anything).
async function getAuth0User(auth0UserId) {
  const token = await getManagementToken();

  const response = await fetch(`https://${domain()}/api/v2/users/${encodeURIComponent(auth0UserId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Auth0 user lookup failed with ${response.status}`);
  }

  return response.json();
}

module.exports = { getManagementToken, deleteAuth0User, getAuth0User };
