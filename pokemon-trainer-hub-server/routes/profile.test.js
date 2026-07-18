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
  let accountService;
  let auth0Management;
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
      supportRequest: {
        create: mock.fn(async ({ data }) => ({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    mock.module(path.resolve(__dirname, '../services/prisma.js'), { exports: { default: prisma } });

    accountService = {
      deleteAccount: mock.fn(async () => ({ auth0DeleteFailed: false })),
      softDeleteAccount: mock.fn(async () => {}),
    };
    mock.module(path.resolve(__dirname, '../services/accountService.js'), { exports: accountService });

    auth0Management = { getAuth0User: mock.fn(async () => ({ email: 'ash@example.com' })) };
    mock.module(path.resolve(__dirname, '../services/auth0Management.js'), { exports: auth0Management });

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
    accountService.deleteAccount.mock.resetCalls();
    accountService.deleteAccount.mock.mockImplementation(async () => ({ auth0DeleteFailed: false }));
    accountService.softDeleteAccount.mock.resetCalls();
    accountService.softDeleteAccount.mock.mockImplementation(async () => {});
    prisma.supportRequest.create.mock.resetCalls();
    prisma.supportRequest.create.mock.mockImplementation(async ({ data }) => ({ id: 1, createdAt: new Date(), ...data }));
    auth0Management.getAuth0User.mock.resetCalls();
    auth0Management.getAuth0User.mock.mockImplementation(async () => ({ email: 'ash@example.com' }));
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

    test('returns 403 ACCOUNT_DELETED with the real deletionType and purgeAt when the trainer is soft-deleted', async () => {
      const purgeAt = new Date('2026-08-01');
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        dateOfBirth: new Date('2000-01-01'),
        deletedAt: new Date(),
        deletionType: 'admin',
        purgeAt,
      }));

      const res = await request.get('/api/profile');

      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'ACCOUNT_DELETED');
      assert.equal(res.body.deletionType, 'admin');
      assert.equal(res.body.purgeAt, purgeAt.toISOString());
    });

    test('never leaks deletedAt/deletionType/purgeAt into a normal (non-deleted) response', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        dateOfBirth: new Date('2000-01-01'),
        deletedAt: null,
        deletionType: null,
        purgeAt: null,
      }));

      const res = await request.get('/api/profile');

      assert.equal(res.status, 200);
      assert.equal('deletedAt' in res.body, false);
      assert.equal('deletionType' in res.body, false);
      assert.equal('purgeAt' in res.body, false);
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

    test('rejects with 403 ACCOUNT_DELETED instead of resurrecting a soft-deleted profile', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        acceptedPolicy: true,
        acceptedPolicyAt: new Date('2025-01-01'),
        policyVersion: 'v1',
        marketingEmailsOptIn: true,
        experienceLevel: 'Beginner',
        deletedAt: new Date(),
        deletionType: 'self',
      }));

      const res = await request.post('/api/profile').send(validSignup);

      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'ACCOUNT_DELETED');
      assert.equal(res.body.deletionType, 'self');
      assert.equal(prisma.trainerProfile.upsert.mock.calls.length, 0);
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

  describe('DELETE /', () => {
    test('soft-deletes the account for the JWT-identified user and returns 200', async () => {
      const res = await request.delete('/api/profile');

      assert.equal(res.status, 200);
      assert.equal(accountService.softDeleteAccount.mock.calls.length, 1);
      assert.equal(accountService.softDeleteAccount.mock.calls[0].arguments[0], FAKE_USER);
      assert.deepEqual(accountService.softDeleteAccount.mock.calls[0].arguments[1], {
        deletedBy: FAKE_USER,
        deletionType: 'self',
      });
      assert.ok(res.body.message);
    });

    test('never calls the real (permanent) deleteAccount for a self-service delete', async () => {
      await request.delete('/api/profile');

      assert.equal(accountService.deleteAccount.mock.calls.length, 0);
    });
  });

  describe('POST /restoration-request', () => {
    test('rejects a missing/empty message before ever touching the database', async () => {
      const res = await request.post('/api/profile/restoration-request').send({ message: '   ' });

      assert.equal(res.status, 400);
      assert.equal(prisma.trainerProfile.findUnique.mock.calls.length, 0);
    });

    test('returns 404 when the caller has no profile at all', async () => {
      const res = await request.post('/api/profile/restoration-request').send({ message: 'please restore me' });

      assert.equal(res.status, 404);
    });

    test('rejects with 400 when the caller\'s account is not actually deleted — never trusts a client claim', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        deletedAt: null,
        deletionType: null,
      }));

      const res = await request.post('/api/profile/restoration-request').send({ message: 'please restore me' });

      assert.equal(res.status, 400);
      assert.equal(prisma.supportRequest.create.mock.calls.length, 0);
    });

    test('a self-deleted trainer creates a real SupportRequest with topic "account_restoration"', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        deletedAt: new Date(),
        deletionType: 'self',
      }));

      const res = await request.post('/api/profile/restoration-request').send({ message: 'I made a mistake, please restore my account.' });

      assert.equal(res.status, 201);
      const data = prisma.supportRequest.create.mock.calls[0].arguments[0].data;
      assert.equal(data.auth0UserId, FAKE_USER);
      assert.equal(data.name, 'Ash');
      assert.equal(data.email, 'ash@example.com');
      assert.equal(data.topic, 'account_restoration');
      assert.equal(data.message, 'I made a mistake, please restore my account.');
    });

    test('an admin-deleted trainer creates a real SupportRequest with topic "account_blocked_contact"', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        deletedAt: new Date(),
        deletionType: 'admin',
      }));

      const res = await request.post('/api/profile/restoration-request').send({ message: 'Why was my account blocked?' });

      assert.equal(res.status, 201);
      assert.equal(prisma.supportRequest.create.mock.calls[0].arguments[0].data.topic, 'account_blocked_contact');
    });

    test('never accepts a client-sent topic — only the real deletionType decides it', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        deletedAt: new Date(),
        deletionType: 'self',
      }));

      await request.post('/api/profile/restoration-request').send({ message: 'hi', topic: 'not-a-real-topic' });

      assert.equal(prisma.supportRequest.create.mock.calls[0].arguments[0].data.topic, 'account_restoration');
    });

    test('returns 502 when Auth0 is unreachable, rather than crashing or faking an email', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        trainerName: 'Ash',
        deletedAt: new Date(),
        deletionType: 'self',
      }));
      auth0Management.getAuth0User.mock.mockImplementationOnce(async () => {
        throw new Error('network down');
      });

      const res = await request.post('/api/profile/restoration-request').send({ message: 'please restore me' });

      assert.equal(res.status, 502);
      assert.equal(prisma.supportRequest.create.mock.calls.length, 0);
    });
  });
});
