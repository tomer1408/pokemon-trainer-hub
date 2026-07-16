const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Only prisma is mocked — ageRange.js and teamNameFallback.js are real,
// already-unit-tested pure helpers, so the route's own validation/consent
// branching is exercised together with genuine date/name logic instead of
// stubbed-out behavior.
describe('routes/profile', () => {
  let request;
  let prisma;
  const FAKE_USER = 'auth0|test-user';

  const validSignup = {
    trainerName: 'Ash',
    favoriteType: 'electric',
    firstName: 'Ash',
    lastName: 'Ketchum',
    dateOfBirth: '2000-01-01',
    country: 'Japan',
    acceptedPolicy: true,
  };

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
      trainerProfile: {
        findUnique: mock.fn(async () => null),
        upsert: mock.fn(async ({ create, update }) => ({ ...(create || update) })),
        update: mock.fn(async ({ data }) => ({ ...data })),
      },
    };
    mock.module(path.resolve(__dirname, '../services/prisma.js'), { exports: { default: prisma } });

    const express = require('express');
    const supertest = require('supertest');
    const profileRouter = require('./profile');

    const app = express();
    app.use(express.json());
    app.use('/api/profile', profileRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    prisma.trainerProfile.findUnique.mock.resetCalls();
    prisma.trainerProfile.upsert.mock.resetCalls();
    prisma.trainerProfile.update.mock.resetCalls();
    prisma.trainerProfile.findUnique.mock.mockImplementation(async () => null);
    prisma.trainerProfile.upsert.mock.mockImplementation(async ({ create, update }) => ({ ...(create || update) }));
    prisma.trainerProfile.update.mock.mockImplementation(async ({ data }) => ({ ...data }));
  });

  describe('GET /', () => {
    test('returns 404 when the trainer has no profile yet', async () => {
      const res = await request.get('/api/profile');
      assert.equal(res.status, 404);
    });

    test('returns the profile enriched with a derived ageRange', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        dateOfBirth: new Date('2000-01-01'),
      }));

      const res = await request.get('/api/profile');

      assert.equal(res.status, 200);
      assert.equal(res.body.trainerName, 'Ash');
      assert.ok(res.body.ageRange);
    });
  });

  describe('POST /', () => {
    test('rejects a request missing a required field', async () => {
      const { trainerName, ...incomplete } = validSignup;
      const res = await request.post('/api/profile').send(incomplete);

      assert.equal(res.status, 400);
      assert.equal(prisma.trainerProfile.upsert.mock.calls.length, 0);
    });

    test('rejects an invalid date of birth', async () => {
      const res = await request.post('/api/profile').send({ ...validSignup, dateOfBirth: 'not-a-date' });
      assert.equal(res.status, 400);
    });

    test('rejects a date of birth in the future', async () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const res = await request.post('/api/profile').send({ ...validSignup, dateOfBirth: future.toISOString() });
      assert.equal(res.status, 400);
    });

    test('rejects a trainer younger than the minimum age', async () => {
      const tooYoung = new Date();
      tooYoung.setFullYear(tooYoung.getFullYear() - 5);
      const res = await request.post('/api/profile').send({ ...validSignup, dateOfBirth: tooYoung.toISOString() });
      assert.equal(res.status, 400);
    });

    test('creating a new profile requires acceptedPolicy === true', async () => {
      const res = await request.post('/api/profile').send({ ...validSignup, acceptedPolicy: false });

      assert.equal(res.status, 400);
      assert.equal(prisma.trainerProfile.upsert.mock.calls.length, 0);
    });

    test('creates a new profile with server-set consent fields and Beginner experience level', async () => {
      const res = await request.post('/api/profile').send(validSignup);

      assert.equal(res.status, 200);
      const data = prisma.trainerProfile.upsert.mock.calls[0].arguments[0].create;
      assert.equal(data.acceptedPolicy, true);
      assert.ok(data.acceptedPolicyAt instanceof Date);
      assert.equal(data.policyVersion, 'v1');
      assert.equal(data.experienceLevel, 'Beginner');
      assert.equal(data.marketingEmailsOptIn, false); // default when not sent
    });

    test('editing an existing profile never re-demands or overwrites the acceptance record', async () => {
      const acceptedAt = new Date('2025-01-01');
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        acceptedPolicy: true,
        acceptedPolicyAt: acceptedAt,
        policyVersion: 'v1',
        marketingEmailsOptIn: true,
        experienceLevel: 'Intermediate',
      }));

      // No acceptedPolicy sent at all on an edit — must not be required or reset.
      const { acceptedPolicy, ...editPayload } = validSignup;
      const res = await request.post('/api/profile').send(editPayload);

      assert.equal(res.status, 200);
      const data = prisma.trainerProfile.upsert.mock.calls[0].arguments[0].update;
      assert.equal(data.acceptedPolicyAt, acceptedAt);
      assert.equal(data.experienceLevel, 'Intermediate'); // preserved, never client-set
      assert.equal(data.marketingEmailsOptIn, true); // preserved, not silently reset to false
    });

    test('editing an existing profile updates marketingEmailsOptIn when explicitly sent', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        acceptedPolicy: true,
        acceptedPolicyAt: new Date('2025-01-01'),
        policyVersion: 'v1',
        marketingEmailsOptIn: true,
        experienceLevel: 'Beginner',
      }));

      const res = await request.post('/api/profile').send({ ...validSignup, marketingEmailsOptIn: false });

      assert.equal(res.status, 200);
      assert.equal(prisma.trainerProfile.upsert.mock.calls[0].arguments[0].update.marketingEmailsOptIn, false);
    });

    test('defaults avatarPokemonId to null and trims/nulls an empty teamName', async () => {
      const res = await request.post('/api/profile').send({ ...validSignup, avatarPokemonId: 'not-a-number', teamName: '   ' });

      assert.equal(res.status, 200);
      const data = prisma.trainerProfile.upsert.mock.calls[0].arguments[0].create;
      assert.equal(data.avatarPokemonId, null);
      assert.equal(data.teamName, null);
    });
  });

  describe('PATCH /starter-quiz', () => {
    test('marks the quiz completed and returns the updated profile', async () => {
      const res = await request.patch('/api/profile/starter-quiz');

      assert.equal(res.status, 200);
      assert.deepEqual(prisma.trainerProfile.update.mock.calls[0].arguments[0].data, {
        hasCompletedStarterQuiz: true,
      });
    });

    test('returns 404 when the trainer has no profile row yet', async () => {
      prisma.trainerProfile.update.mock.mockImplementationOnce(async () => {
        throw new Error('not found');
      });

      const res = await request.patch('/api/profile/starter-quiz');
      assert.equal(res.status, 404);
    });
  });

  describe('PATCH /team-name', () => {
    test('rejects an invalid name (real validateTeamNameValue logic, e.g. too short)', async () => {
      const res = await request.patch('/api/profile/team-name').send({ name: 'A' });

      assert.equal(res.status, 400);
      assert.equal(prisma.trainerProfile.update.mock.calls.length, 0);
    });

    test('trims and persists a valid name', async () => {
      const res = await request.patch('/api/profile/team-name').send({ name: '  Thunder Squad  ' });

      assert.equal(res.status, 200);
      assert.equal(prisma.trainerProfile.update.mock.calls[0].arguments[0].data.teamName, 'Thunder Squad');
    });

    test('returns 404 when the trainer has no profile row yet', async () => {
      prisma.trainerProfile.update.mock.mockImplementationOnce(async () => {
        throw new Error('not found');
      });

      const res = await request.patch('/api/profile/team-name').send({ name: 'Thunder Squad' });
      assert.equal(res.status, 404);
    });
  });

  describe('PATCH /whos-that-streak', () => {
    test('rejects a non-integer or negative streak', async () => {
      const res = await request.patch('/api/profile/whos-that-streak').send({ streak: -1 });
      assert.equal(res.status, 400);
    });

    test('returns 404 when the trainer has no profile row yet', async () => {
      const res = await request.patch('/api/profile/whos-that-streak').send({ streak: 5 });
      assert.equal(res.status, 404);
    });

    test('keeps the higher of the existing best and the submitted streak (never regresses)', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({ whosThatBestStreak: 10 }));

      const res = await request.patch('/api/profile/whos-that-streak').send({ streak: 3 });

      assert.equal(res.status, 200);
      assert.equal(prisma.trainerProfile.update.mock.calls[0].arguments[0].data.whosThatBestStreak, 10);
    });

    test('accepts a new best when it is genuinely higher', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({ whosThatBestStreak: 3 }));

      const res = await request.patch('/api/profile/whos-that-streak').send({ streak: 10 });

      assert.equal(res.status, 200);
      assert.equal(prisma.trainerProfile.update.mock.calls[0].arguments[0].data.whosThatBestStreak, 10);
    });
  });
});
