const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/adminAnalytics', () => {
  let request;
  let authPayload;
  let adminAnalyticsService;

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: authPayload };
          next();
        },
      },
    });

    adminAnalyticsService = {
      getAnalytics: mock.fn(async () => ({
        days: 30,
        overTime: { profiles: [], battles: [] },
        funnel: [],
        popularPokemon: { inTeams: [], favorited: [] },
        battleStats: { results: [], byDifficulty: [], byOpponentType: [] },
        whosThatStats: { averageBestStreak: 0, highestBestStreak: 0, trainersWhoHavePlayed: 0 },
        supportStats: { byTopic: [], byStatus: [] },
      })),
    };
    mock.module(path.resolve(__dirname, '../services/adminAnalyticsService.js'), { exports: adminAnalyticsService });

    const express = require('express');
    const supertest = require('supertest');
    const adminAnalyticsRouter = require('./adminAnalytics');

    const app = express();
    app.use(express.json());
    app.use('/api/admin/analytics', adminAnalyticsRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    authPayload = { sub: 'auth0|admin', permissions: ['admin:read'] };
    adminAnalyticsService.getAnalytics.mock.resetCalls();
  });

  test('returns 401 when no token is present', async () => {
    authPayload = undefined;

    const res = await request.get('/api/admin/analytics');

    assert.equal(res.status, 401);
  });

  test('returns 403 when the token lacks admin:read', async () => {
    authPayload = { sub: 'auth0|trainer', permissions: ['users:manage'] };

    const res = await request.get('/api/admin/analytics');

    assert.equal(res.status, 403);
    assert.equal(adminAnalyticsService.getAnalytics.mock.calls.length, 0);
  });

  test('passes the real days query param through to the service', async () => {
    const res = await request.get('/api/admin/analytics?days=14');

    assert.equal(res.status, 200);
    assert.equal(adminAnalyticsService.getAnalytics.mock.calls[0].arguments[0], '14');
  });

  test('returns the real combined analytics response on 200', async () => {
    const res = await request.get('/api/admin/analytics');

    assert.equal(res.status, 200);
    assert.ok('funnel' in res.body);
    assert.ok('popularPokemon' in res.body);
  });
});
