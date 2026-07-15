const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Route-level tests, same convention as routes/team.test.js. Focus here is
// authorization: proving every call into favoritesService is scoped to the
// JWT's own subject, never anything a client sends — this route previously
// had zero test coverage.
describe('routes/favorites (authorization)', () => {
  let request;
  let favoritesService;
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

    favoritesService = {
      getFavorites: mock.fn(async () => []),
      addFavorite: mock.fn(async () => ({ message: 'ok' })),
      removeFavorite: mock.fn(async () => {}),
    };
    mock.module(path.resolve(__dirname, '../services/favoritesService.js'), {
      exports: { default: favoritesService },
    });

    const express = require('express');
    const supertest = require('supertest');
    const favoritesRouter = require('./favorites');

    const app = express();
    app.use(express.json());
    app.use('/api/favorites', favoritesRouter);
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({ message: 'Something went wrong on our end.' });
    });

    request = supertest(app);
  });

  beforeEach(() => {
    favoritesService.getFavorites.mock.resetCalls();
    favoritesService.addFavorite.mock.resetCalls();
    favoritesService.removeFavorite.mock.resetCalls();
  });

  test('GET / is scoped to the JWT subject', async () => {
    const res = await request.get('/api/favorites');

    assert.equal(res.status, 200);
    assert.deepEqual(favoritesService.getFavorites.mock.calls[0].arguments, [FAKE_USER]);
  });

  test('POST /:id adds under the JWT subject, ignoring any client-supplied user id in the body', async () => {
    // Even if a client sends its own "userId", identity must only ever come
    // from the verified token, never the request body.
    const res = await request.post('/api/favorites/25').send({ userId: 'auth0|someone-else' });

    assert.equal(res.status, 201);
    assert.deepEqual(favoritesService.addFavorite.mock.calls[0].arguments, [FAKE_USER, 25]);
  });

  test('POST /:id with a non-numeric id is rejected before touching favoritesService', async () => {
    const res = await request.post('/api/favorites/not-a-number');

    assert.equal(res.status, 400);
    assert.equal(favoritesService.addFavorite.mock.calls.length, 0);
  });

  test('DELETE /:id is scoped to the JWT subject — cannot be pointed at another user via the id alone', async () => {
    const res = await request.delete('/api/favorites/999');

    assert.equal(res.status, 204);
    assert.deepEqual(favoritesService.removeFavorite.mock.calls[0].arguments, [FAKE_USER, 999]);
  });
});
