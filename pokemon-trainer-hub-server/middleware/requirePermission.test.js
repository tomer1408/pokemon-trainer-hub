const { describe, test, mock } = require('node:test');
const assert = require('node:assert/strict');
const requirePermission = require('./requirePermission');

// Pure middleware, no external dependencies to mock — a plain req/res/next
// fake is enough (same lightweight approach as this repo's other
// dependency-free unit tests, e.g. services/ageRange.test.js).
function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('middleware/requirePermission', () => {
  test('responds 401 when req.auth is entirely missing (jwtCheck not mounted / not run)', () => {
    const req = {};
    const res = fakeRes();
    const next = mock.fn();

    requirePermission('admin:read')(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  test('responds 401 when req.auth.payload is missing', () => {
    const req = { auth: {} };
    const res = fakeRes();
    const next = mock.fn();

    requirePermission('admin:read')(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  test('responds 403 when the permissions claim is missing entirely (fails closed, not open)', () => {
    const req = { auth: { payload: { sub: 'auth0|test' } } };
    const res = fakeRes();
    const next = mock.fn();

    requirePermission('admin:read')(req, res, next);

    assert.equal(res.statusCode, 403);
    assert.equal(next.mock.calls.length, 0);
  });

  test('responds 403 when the permissions claim is malformed (not an array) — fails closed, not throws', () => {
    const req = { auth: { payload: { permissions: 'admin:read' } } };
    const res = fakeRes();
    const next = mock.fn();

    assert.doesNotThrow(() => requirePermission('admin:read')(req, res, next));
    assert.equal(res.statusCode, 403);
  });

  test('responds 403 when the token has permissions but not the required one', () => {
    const req = { auth: { payload: { permissions: ['support:manage'] } } };
    const res = fakeRes();
    const next = mock.fn();

    requirePermission('admin:read')(req, res, next);

    assert.equal(res.statusCode, 403);
    assert.equal(next.mock.calls.length, 0);
  });

  test('calls next() with no response when the required permission is present', () => {
    const req = { auth: { payload: { permissions: ['admin:read', 'support:manage'] } } };
    const res = fakeRes();
    const next = mock.fn();

    requirePermission('admin:read')(req, res, next);

    assert.equal(next.mock.calls.length, 1);
    assert.equal(res.statusCode, null);
  });
});
