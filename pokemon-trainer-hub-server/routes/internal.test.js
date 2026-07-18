const { describe, test, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/internal', () => {
  let request;
  let purgeSweepService;
  const originalSecret = process.env.PURGE_SWEEP_SECRET;

  before(() => {
    purgeSweepService = { runPurgeSweep: mock.fn(async () => ({ purged: 0 })) };
    mock.module(path.resolve(__dirname, '../services/purgeSweepService.js'), { exports: purgeSweepService });

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
    purgeSweepService.runPurgeSweep.mock.mockImplementation(async () => ({ purged: 0 }));
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
    purgeSweepService.runPurgeSweep.mock.mockImplementationOnce(async () => ({ purged: 3 }));

    const res = await request.post('/api/internal/purge-sweep').set('x-purge-secret', 'real-secret');

    assert.equal(res.status, 200);
    assert.equal(res.body.purged, 3);
    assert.equal(purgeSweepService.runPurgeSweep.mock.calls.length, 1);
  });
});
