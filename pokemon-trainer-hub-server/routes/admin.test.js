const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Route-level test: exercises the real Express router + the real
// requirePermission middleware on top of it, with only middleware/auth.js
// (jwtCheck) swapped for a test double — same convention as routes/team.test.js
// — so this never touches a real Auth0 tenant. jwtCheck's own real 401
// behavior (an entirely missing/invalid token) is covered separately by
// middleware/requirePermission.test.js's "req.auth.payload missing" case;
// this file is about proving requirePermission is genuinely wired onto the
// route and reacts correctly to what a real token's `permissions` claim
// would contain.
describe('routes/admin', () => {
  let request;
  let authPayload;

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: authPayload };
          next();
        },
      },
    });

    const express = require('express');
    const supertest = require('supertest');
    const adminRouter = require('./admin');

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    authPayload = { sub: 'auth0|test-admin', permissions: ['admin:read'] };
  });

  describe('GET /ping', () => {
    test('returns 200 with a real payload when the token has admin:read', async () => {
      const res = await request.get('/api/admin/ping');

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.ok(res.body.message);
    });

    test('returns 403 when the token is valid but lacks admin:read', async () => {
      authPayload = { sub: 'auth0|test-user', permissions: ['support:manage'] };

      const res = await request.get('/api/admin/ping');

      assert.equal(res.status, 403);
    });

    test('returns 403 when the token has no permissions claim at all', async () => {
      authPayload = { sub: 'auth0|test-user' };

      const res = await request.get('/api/admin/ping');

      assert.equal(res.status, 403);
    });
  });
});
