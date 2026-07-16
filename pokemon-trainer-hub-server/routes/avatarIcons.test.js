const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/avatarIcons', () => {
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

    prisma = { avatarIcon: { findMany: mock.fn(async () => []) } };
    mock.module(path.resolve(__dirname, '../services/prisma.js'), { exports: { default: prisma } });

    const express = require('express');
    const supertest = require('supertest');
    const avatarIconsRouter = require('./avatarIcons');

    const app = express();
    app.use('/api/avatar-icons', avatarIconsRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    prisma.avatarIcon.findMany.mock.resetCalls();
    prisma.avatarIcon.findMany.mock.mockImplementation(async () => []);
  });

  test('GET / returns the full curated icon set ordered by category then sortOrder', async () => {
    const icons = [{ id: 1, name: 'pikachu', category: 'popular', sortOrder: 0 }];
    prisma.avatarIcon.findMany.mock.mockImplementationOnce(async () => icons);

    const res = await request.get('/api/avatar-icons');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, icons);
    assert.deepEqual(prisma.avatarIcon.findMany.mock.calls[0].arguments[0], {
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  });
});
