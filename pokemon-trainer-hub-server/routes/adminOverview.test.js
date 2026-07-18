const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/adminOverview', () => {
  let request;
  let authPayload;
  let adminOverviewService;

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: authPayload };
          next();
        },
      },
    });

    adminOverviewService = {
      getOverview: mock.fn(async () => ({ kpis: {}, recentSupportRequests: [], recentActivity: [] })),
    };
    mock.module(path.resolve(__dirname, '../services/adminOverviewService.js'), { exports: adminOverviewService });

    const express = require('express');
    const supertest = require('supertest');
    const adminOverviewRouter = require('./adminOverview');

    const app = express();
    app.use(express.json());
    app.use('/api/admin/overview', adminOverviewRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    authPayload = { sub: 'auth0|admin', permissions: ['admin:read'] };
    adminOverviewService.getOverview.mock.resetCalls();
    adminOverviewService.getOverview.mock.mockImplementation(async () => ({
      kpis: {},
      recentSupportRequests: [],
      recentActivity: [],
    }));
  });

  test('returns 401 when no token is present', async () => {
    authPayload = undefined;

    const res = await request.get('/api/admin/overview');

    assert.equal(res.status, 401);
  });

  test('returns 403 when the token lacks admin:read', async () => {
    authPayload = { sub: 'auth0|trainer', permissions: ['users:manage'] };

    const res = await request.get('/api/admin/overview');

    assert.equal(res.status, 403);
    assert.equal(adminOverviewService.getOverview.mock.calls.length, 0);
  });

  test('returns the real combined overview response on 200', async () => {
    adminOverviewService.getOverview.mock.mockImplementationOnce(async () => ({
      kpis: { totalTrainers: 7 },
      recentSupportRequests: [{ id: 1 }],
      recentActivity: [{ type: 'trainer_joined' }],
    }));

    const res = await request.get('/api/admin/overview');

    assert.equal(res.status, 200);
    assert.equal(res.body.kpis.totalTrainers, 7);
    assert.equal(res.body.recentSupportRequests.length, 1);
    assert.equal(res.body.recentActivity.length, 1);
    assert.equal(adminOverviewService.getOverview.mock.calls.length, 1);
  });
});
