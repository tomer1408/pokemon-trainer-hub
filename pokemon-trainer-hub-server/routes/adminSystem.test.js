const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/adminSystem', () => {
  let request;
  let authPayload;
  let adminHealthService;

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: authPayload };
          next();
        },
      },
    });

    adminHealthService = {
      getSystemHealth: mock.fn(async () => ({
        runtime: {},
        dependencies: [],
        errors: { sentryStatus: 'not_configured' },
        build: {},
      })),
    };
    mock.module(path.resolve(__dirname, '../services/adminHealthService.js'), { exports: adminHealthService });

    const express = require('express');
    const supertest = require('supertest');
    const adminSystemRouter = require('./adminSystem');

    const app = express();
    app.use(express.json());
    app.use('/api/admin/system', adminSystemRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    authPayload = { sub: 'auth0|admin', permissions: ['admin:read'] };
    adminHealthService.getSystemHealth.mock.resetCalls();
    adminHealthService.getSystemHealth.mock.mockImplementation(async () => ({
      runtime: {},
      dependencies: [],
      errors: { sentryStatus: 'not_configured' },
      build: {},
    }));
  });

  test('returns 401 when no token is present', async () => {
    authPayload = undefined;

    const res = await request.get('/api/admin/system');

    assert.equal(res.status, 401);
  });

  test('returns 403 when the token lacks admin:read', async () => {
    authPayload = { sub: 'auth0|trainer', permissions: ['users:manage'] };

    const res = await request.get('/api/admin/system');

    assert.equal(res.status, 403);
    assert.equal(adminHealthService.getSystemHealth.mock.calls.length, 0);
  });

  test('returns the real system health response on 200', async () => {
    adminHealthService.getSystemHealth.mock.mockImplementationOnce(async () => ({
      runtime: { nodeVersion: 'v20.0.0' },
      dependencies: [{ name: 'Database', status: 'operational', latencyMs: 5 }],
      errors: { sentryStatus: 'configured' },
      build: { gitCommit: 'abc1234' },
    }));

    const res = await request.get('/api/admin/system');

    assert.equal(res.status, 200);
    assert.equal(res.body.runtime.nodeVersion, 'v20.0.0');
    assert.equal(res.body.dependencies[0].name, 'Database');
    assert.equal(res.body.errors.sentryStatus, 'configured');
    assert.equal(res.body.build.gitCommit, 'abc1234');
  });
});
