const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/events', () => {
  let request;
  let analyticsEventService;
  let rateLimiter;
  const FAKE_USER = 'auth0|test-user';

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: { sub: FAKE_USER } };
          next();
        },
      },
    });

    // Real assertValidClientEvent/logEvent logic runs unmocked here — only
    // prisma (inside analyticsEventService) would need mocking, but since
    // this route's own tests only exercise validation + the real 201 path
    // needs an actual DB call, we mock the service itself directly instead,
    // matching the convention used by every other route test that composes
    // a service it doesn't own.
    analyticsEventService = {
      logEvent: mock.fn(async ({ eventType }) => ({ id: 1, eventType })),
      assertValidClientEvent: mock.fn(() => {}),
    };
    mock.module(path.resolve(__dirname, '../services/analyticsEventService.js'), { exports: analyticsEventService });

    rateLimiter = { consume: mock.fn(() => true) };
    mock.module(path.resolve(__dirname, '../services/rateLimiter.js'), {
      exports: { createRateLimiter: () => rateLimiter },
    });

    const express = require('express');
    const supertest = require('supertest');
    const eventsRouter = require('./events');

    const app = express();
    app.use(express.json());
    app.use('/api/events', eventsRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    analyticsEventService.logEvent.mock.resetCalls();
    analyticsEventService.logEvent.mock.mockImplementation(async ({ eventType }) => ({ id: 1, eventType }));
    analyticsEventService.assertValidClientEvent.mock.resetCalls();
    analyticsEventService.assertValidClientEvent.mock.mockImplementation(() => {});
    rateLimiter.consume.mock.resetCalls();
    rateLimiter.consume.mock.mockImplementation(() => true);
  });

  test('is rate-limited per trainer: returns 503 and never validates or writes once the limit is hit', async () => {
    rateLimiter.consume.mock.mockImplementationOnce(() => false);

    const res = await request.post('/api/events').send({ eventType: 'session_started' });

    assert.equal(res.status, 503);
    assert.equal(analyticsEventService.assertValidClientEvent.mock.calls.length, 0);
    assert.equal(analyticsEventService.logEvent.mock.calls.length, 0);
  });

  test('rejects (400) whatever the real validator rejects, without a raw 500', async () => {
    const ServiceError = require('../services/serviceError');
    analyticsEventService.assertValidClientEvent.mock.mockImplementationOnce(() => {
      throw new ServiceError('INVALID_EVENT_TYPE', 'eventType must be one of: session_started, page_viewed, whos_that_round_completed.');
    });

    const res = await request.post('/api/events').send({ eventType: 'battle_completed' });

    assert.equal(res.status, 400);
    assert.equal(analyticsEventService.logEvent.mock.calls.length, 0);
  });

  test('the acting trainer is always the verified JWT subject, never anything the client sends', async () => {
    await request.post('/api/events').send({ eventType: 'session_started', auth0UserId: 'auth0|someone-else' });

    assert.equal(analyticsEventService.logEvent.mock.calls[0].arguments[0].auth0UserId, FAKE_USER);
  });

  test('a valid event under the limit is persisted and returns 201 with a real id', async () => {
    const res = await request.post('/api/events').send({
      eventType: 'whos_that_round_completed',
      metadata: { correct: true, streak: 4 },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.id, 1);
    assert.deepEqual(analyticsEventService.logEvent.mock.calls[0].arguments[0], {
      auth0UserId: FAKE_USER,
      eventType: 'whos_that_round_completed',
      pageName: null,
      metadata: { correct: true, streak: 4 },
    });
  });

  test('passes a real pageName through for a page_viewed event', async () => {
    await request.post('/api/events').send({ eventType: 'page_viewed', pageName: 'explorer' });

    assert.equal(analyticsEventService.logEvent.mock.calls[0].arguments[0].pageName, 'explorer');
  });

  test('a non-string pageName is normalized to null, not passed through raw', async () => {
    await request.post('/api/events').send({ eventType: 'page_viewed', pageName: { evil: true } });

    assert.equal(analyticsEventService.logEvent.mock.calls[0].arguments[0].pageName, null);
  });
});
