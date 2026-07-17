const { describe, test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// auth0Management.js calls the global `fetch` directly (no injection point),
// same convention as pokeapi.test.js — stubs global.fetch rather than adding
// test-only dependency injection to production code.
describe('services/auth0Management', () => {
  const modulePath = require.resolve('./auth0Management.js');
  let auth0Management;
  let fetchMock;
  let originalEnv;

  before(() => {
    originalEnv = { ...process.env };
    process.env.AUTH0_ISSUER_BASE_URL = 'https://test-tenant.us.auth0.com/';
    process.env.AUTH0_M2M_CLIENT_ID = 'test-client-id';
    process.env.AUTH0_M2M_CLIENT_SECRET = 'test-client-secret';

    fetchMock = mock.method(global, 'fetch');
  });

  after(() => {
    fetchMock.mock.restore();
    process.env = originalEnv;
  });

  // The token cache is a plain module-level variable (see auth0Management.js)
  // — re-requiring a fresh copy of the module each test resets it, so token
  // caching/expiry behavior can be tested in isolation per test instead of
  // depending on execution order.
  beforeEach(() => {
    fetchMock.mock.resetCalls();
    delete require.cache[modulePath];
    auth0Management = require('./auth0Management');
  });

  function tokenPayload(overrides = {}) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'test-token', expires_in: 86400, ...overrides }),
    };
  }

  test('getManagementToken requests a client-credentials token with the right shape', async () => {
    fetchMock.mock.mockImplementation(async () => tokenPayload());

    const token = await auth0Management.getManagementToken();

    assert.equal(token, 'test-token');
    assert.equal(fetchMock.mock.calls.length, 1);
    const [url, options] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://test-tenant.us.auth0.com/oauth/token');
    const body = JSON.parse(options.body);
    assert.equal(body.grant_type, 'client_credentials');
    assert.equal(body.client_id, 'test-client-id');
    assert.equal(body.client_secret, 'test-client-secret');
    assert.equal(body.audience, 'https://test-tenant.us.auth0.com/api/v2/');
  });

  test('caches the token — a second call within the expiry window does not refetch', async () => {
    fetchMock.mock.mockImplementation(async () => tokenPayload());

    await auth0Management.getManagementToken();
    await auth0Management.getManagementToken();

    assert.equal(fetchMock.mock.calls.length, 1);
  });

  test('refetches once the cached token has expired', async () => {
    fetchMock.mock.mockImplementation(async () => tokenPayload({ expires_in: -1 }));

    await auth0Management.getManagementToken();
    await auth0Management.getManagementToken();

    assert.equal(fetchMock.mock.calls.length, 2);
  });

  test('getManagementToken throws when Auth0 responds with a non-ok status', async () => {
    fetchMock.mock.mockImplementation(async () => ({ ok: false, status: 401 }));

    await assert.rejects(auth0Management.getManagementToken());
  });

  test('deleteAuth0User calls DELETE on the correctly-encoded user id with a Bearer token', async () => {
    fetchMock.mock.mockImplementation(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenPayload({ expires_in: -1 });
      return { ok: true, status: 204 };
    });

    await auth0Management.deleteAuth0User('auth0|abc123');

    const deleteCall = fetchMock.mock.calls.find(({ arguments: [url] }) => !String(url).includes('/oauth/token'));
    const [url, options] = deleteCall.arguments;
    assert.equal(url, 'https://test-tenant.us.auth0.com/api/v2/users/auth0%7Cabc123');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
  });

  test('deleteAuth0User throws when Auth0 responds with a non-ok status', async () => {
    fetchMock.mock.mockImplementation(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenPayload({ expires_in: -1 });
      return { ok: false, status: 404 };
    });

    await assert.rejects(auth0Management.deleteAuth0User('auth0|missing'));
  });
});
