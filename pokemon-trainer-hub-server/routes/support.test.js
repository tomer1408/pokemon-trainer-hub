const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/support', () => {
  let request;
  let prisma;
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

    prisma = {
      supportRequest: {
        create: mock.fn(async ({ data }) => ({ id: 1, createdAt: new Date('2026-01-01'), ...data })),
      },
    };
    mock.module(path.resolve(__dirname, '../services/prisma.js'), { exports: { default: prisma } });

    const express = require('express');
    const supertest = require('supertest');
    const supportRouter = require('./support');

    const app = express();
    app.use(express.json());
    app.use('/api/support', supportRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    prisma.supportRequest.create.mock.resetCalls();
  });

  test('POST / rejects an invalid email', async () => {
    const res = await request
      .post('/api/support')
      .send({ name: 'Ash', email: 'not-an-email', topic: 'Bug', message: 'It broke.' });

    assert.equal(res.status, 400);
    assert.equal(prisma.supportRequest.create.mock.calls.length, 0);
  });

  test('POST / rejects a missing topic', async () => {
    const res = await request
      .post('/api/support')
      .send({ name: 'Ash', email: 'ash@example.com', topic: '', message: 'It broke.' });

    assert.equal(res.status, 400);
    assert.equal(prisma.supportRequest.create.mock.calls.length, 0);
  });

  test('POST / rejects a missing message', async () => {
    const res = await request
      .post('/api/support')
      .send({ name: 'Ash', email: 'ash@example.com', topic: 'Bug', message: '   ' });

    assert.equal(res.status, 400);
    assert.equal(prisma.supportRequest.create.mock.calls.length, 0);
  });

  test('POST / accepts an empty name — only email, topic, message are required', async () => {
    const res = await request
      .post('/api/support')
      .send({ name: '', email: 'ash@example.com', topic: 'Bug', message: 'It broke.' });

    assert.equal(res.status, 201);
    assert.equal(prisma.supportRequest.create.mock.calls.length, 1);
  });

  test('POST / persists a valid request scoped to the JWT user and returns 201', async () => {
    const res = await request
      .post('/api/support')
      .send({ name: '  Ash  ', email: '  ash@example.com  ', topic: ' Bug ', message: ' It broke. ' });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { id: 1, createdAt: '2026-01-01T00:00:00.000Z' });
    assert.deepEqual(prisma.supportRequest.create.mock.calls[0].arguments[0].data, {
      auth0UserId: FAKE_USER,
      name: 'Ash',
      email: 'ash@example.com',
      topic: 'Bug',
      message: 'It broke.',
    });
  });
});
