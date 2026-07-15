const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Route-level tests, mocking services/prisma.js directly since routes/notes.js
// talks to Prisma without a separate service layer. Focus is the same IDOR
// concern the route's own comment calls out: "a user can't delete another
// trainer's note by guessing an id" — this route previously had zero test
// coverage at all.
describe('routes/notes (authorization / IDOR)', () => {
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
      trainerNote: {
        findMany: mock.fn(async () => []),
        create: mock.fn(async (args) => ({ id: 1, ...args.data })),
        deleteMany: mock.fn(async () => ({ count: 1 })),
      },
    };
    mock.module(path.resolve(__dirname, '../services/prisma.js'), { exports: { default: prisma } });

    const express = require('express');
    const supertest = require('supertest');
    const notesRouter = require('./notes');

    const app = express();
    app.use(express.json());
    app.use('/api/notes', notesRouter);
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({ message: 'Something went wrong on our end.' });
    });

    request = supertest(app);
  });

  beforeEach(() => {
    prisma.trainerNote.findMany.mock.resetCalls();
    prisma.trainerNote.create.mock.resetCalls();
    prisma.trainerNote.deleteMany.mock.resetCalls();
  });

  test('GET /:pokemonId scopes the query to the JWT subject', async () => {
    const res = await request.get('/api/notes/25');

    assert.equal(res.status, 200);
    assert.deepEqual(prisma.trainerNote.findMany.mock.calls[0].arguments[0], {
      where: { auth0UserId: FAKE_USER, pokemonId: 25 },
      orderBy: { createdAt: 'desc' },
    });
  });

  test('POST /:pokemonId creates the note under the JWT subject, ignoring any client-supplied auth0UserId', async () => {
    const res = await request
      .post('/api/notes/25')
      .send({ text: 'Great in battle!', auth0UserId: 'auth0|someone-else' });

    assert.equal(res.status, 201);
    assert.deepEqual(prisma.trainerNote.create.mock.calls[0].arguments[0], {
      data: { auth0UserId: FAKE_USER, pokemonId: 25, text: 'Great in battle!' },
    });
  });

  test("DELETE /:noteId scopes the deletion to the JWT subject — can't delete another trainer's note by guessing its id", async () => {
    const res = await request.delete('/api/notes/999');

    assert.equal(res.status, 204);
    // The actual IDOR guard: the WHERE clause requires BOTH the guessed note
    // id AND the real, JWT-derived auth0UserId — a note id belonging to
    // another trainer simply matches zero rows, deleteMany is a no-op, and
    // the caller still gets a 204 (idempotent), never a hint either way.
    assert.deepEqual(prisma.trainerNote.deleteMany.mock.calls[0].arguments[0], {
      where: { id: 999, auth0UserId: FAKE_USER },
    });
  });

  test('DELETE /:noteId with a non-numeric id is rejected before touching Prisma', async () => {
    const res = await request.delete('/api/notes/not-a-number');

    assert.equal(res.status, 400);
    assert.equal(prisma.trainerNote.deleteMany.mock.calls.length, 0);
  });

  test('POST /:pokemonId with empty text is rejected before touching Prisma', async () => {
    const res = await request.post('/api/notes/25').send({ text: '   ' });

    assert.equal(res.status, 400);
    assert.equal(prisma.trainerNote.create.mock.calls.length, 0);
  });
});
