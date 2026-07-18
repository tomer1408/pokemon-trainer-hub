const { describe, test, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/internal', () => {
  let request;
  let purgeSweepService;
  let rateLimiter;
  const originalSecret = process.env.PURGE_SWEEP_SECRET;

  before(() => {
    purgeSweepService = { runPurgeSweep: mock.fn(async () => ({ eligible: 0, purged: 0, skipped: 0, failed: 0 })) };
    mock.module(path.resolve(__dirname, '../services/purgeSweepService.js'), { exports: purgeSweepService });

    // Same mocking convention as routes/assistant.test.js's own rate
    // limiter — a controllable consume() means rate-limit behavior is
    // tested directly, not by racing a real 60-second window.
    rateLimiter = { consume: mock.fn(() => true) };
    mock.module(path.resolve(__dirname, '../services/rateLimiter.js'), {
      exports: { createRateLimiter: () => rateLimiter },
    });

    const express = require('express');
    const supertest = require('supertest');
    const internalRouter = require('./internal');

    const app = express();
    app.use(express.json());
    app.use('/api/internal', internalRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    process.env.PURGE_SWEEP_SECRET = 'real-secret';
    purgeSweepService.runPurgeSweep.mock.resetCalls();
    purgeSweepService.runPurgeSweep.mock.mockImplementation(async () => ({ eligible: 0, purged: 0, skipped: 0, failed: 0 }));
    rateLimiter.consume.mock.resetCalls();
    rateLimiter.consume.mock.mockImplementation(() => true);
  });

  afterEach(() => {
    process.env.PURGE_SWEEP_SECRET = originalSecret;
  });

  test('returns 401 when no secret header is sent, and never runs the sweep', async () => {
    const res = await request.post('/api/internal/purge-sweep');

    assert.equal(res.status, 401);
    assert.equal(purgeSweepService.runPurgeSweep.mock.calls.length, 0);
  });

  test('returns 401 when the secret header is wrong', async () => {
    const res = await request.post('/api/internal/purge-sweep').set('x-purge-secret', 'wrong');

    assert.equal(res.status, 401);
    assert.equal(purgeSweepService.runPurgeSweep.mock.calls.length, 0);
  });

  test('runs the real sweep and returns its real result when the secret matches', async () => {
    purgeSweepService.runPurgeSweep.mock.mockImplementationOnce(async () => ({
      eligible: 3,
      purged: 3,
      skipped: 0,
      failed: 0,
    }));

    const res = await request.post('/api/internal/purge-sweep').set('x-purge-secret', 'real-secret');

    assert.equal(res.status, 200);
    assert.equal(res.body.purged, 3);
    assert.equal(purgeSweepService.runPurgeSweep.mock.calls.length, 1);
  });

  test('the 401 response never echoes the configured secret or the header the caller sent', async () => {
    const res = await request.post('/api/internal/purge-sweep').set('x-purge-secret', 'a-wrong-guess');

    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('real-secret'));
    assert.ok(!body.includes('a-wrong-guess'));
  });

  test('a successful sweep response contains only aggregate counts, never a user id or other identifying data', async () => {
    purgeSweepService.runPurgeSweep.mock.mockImplementationOnce(async () => ({
      eligible: 1,
      purged: 1,
      skipped: 0,
      failed: 0,
    }));

    const res = await request.post('/api/internal/purge-sweep').set('x-purge-secret', 'real-secret');

    assert.deepEqual(Object.keys(res.body).sort(), ['eligible', 'failed', 'purged', 'skipped']);
  });

  test('is rate-limited: a request is rejected with 429 once the limiter reports the key is exhausted, before the secret is even checked', async () => {
    rateLimiter.consume.mock.mockImplementationOnce(() => false);

    const res = await request.post('/api/internal/purge-sweep').set('x-purge-secret', 'real-secret');

    assert.equal(res.status, 429);
    assert.equal(purgeSweepService.runPurgeSweep.mock.calls.length, 0);
  });

  test('rate limiting applies even to requests with no secret at all (throttles brute-force guessing, not just legitimate calls)', async () => {
    rateLimiter.consume.mock.mockImplementationOnce(() => false);

    const res = await request.post('/api/internal/purge-sweep');

    assert.equal(res.status, 429);
  });

  test('a request under the limit with the correct secret still runs the sweep normally', async () => {
    const res = await request.post('/api/internal/purge-sweep').set('x-purge-secret', 'real-secret');

    assert.equal(res.status, 200);
    assert.equal(purgeSweepService.runPurgeSweep.mock.calls.length, 1);
  });
});
