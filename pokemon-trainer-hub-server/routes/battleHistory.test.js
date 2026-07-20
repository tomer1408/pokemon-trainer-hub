const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/battleHistory', () => {
  let request;
  let prisma;
  let analyticsEventService;
  const FAKE_USER = 'auth0|test-user';

  const validMatchBody = {
    opponentName: 'Team Rocket',
    difficulty: 'hard',
    opponentType: 'fire',
    luckFactor: 'balanced',
    rounds: 5,
    roundsPlayed: 5,
    yourWins: 3,
    oppWins: 2,
    result: 'win',
    roundDetails: [{ round: 1 }],
    teamSnapshot: [{ pokemonId: 25 }],
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
      battleMatch: {
        findMany: mock.fn(async () => []),
        create: mock.fn(async ({ data }) => ({ id: 1, createdAt: new Date('2026-01-01'), ...data })),
      },
    };
    mock.module(path.resolve(__dirname, '../services/prisma.js'), { exports: { default: prisma } });

    analyticsEventService = { logEventSafe: mock.fn(async () => {}) };
    mock.module(path.resolve(__dirname, '../services/analyticsEventService.js'), { exports: analyticsEventService });

    const express = require('express');
    const supertest = require('supertest');
    const battleHistoryRouter = require('./battleHistory');

    const app = express();
    app.use(express.json());
    app.use('/api/battle-history', battleHistoryRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    prisma.battleMatch.findMany.mock.resetCalls();
    prisma.battleMatch.create.mock.resetCalls();
    prisma.battleMatch.findMany.mock.mockImplementation(async () => []);
    analyticsEventService.logEventSafe.mock.resetCalls();
  });

  describe('GET /', () => {
    test('returns matches for the JWT user, parsing the JSON-serialized round/team-snapshot columns', async () => {
      prisma.battleMatch.findMany.mock.mockImplementationOnce(async () => [
        {
          id: 1,
          opponentName: 'Team Rocket',
          difficulty: 'hard',
          rounds: 5,
          roundsPlayed: 5,
          opponentType: 'fire',
          luckFactor: 'balanced',
          result: 'win',
          yourWins: 3,
          oppWins: 2,
          roundsJson: JSON.stringify([{ round: 1 }]),
          teamSnapshotJson: JSON.stringify([{ pokemonId: 25 }]),
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const res = await request.get('/api/battle-history');

      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.deepEqual(res.body[0].roundDetails, [{ round: 1 }]);
      assert.deepEqual(res.body[0].teamSnapshot, [{ pokemonId: 25 }]);
      assert.deepEqual(prisma.battleMatch.findMany.mock.calls[0].arguments[0], {
        where: { auth0UserId: FAKE_USER },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('POST /', () => {
    test('rejects a match record missing a required field', async () => {
      const { opponentName, ...incomplete } = validMatchBody;
      const res = await request.post('/api/battle-history').send(incomplete);

      assert.equal(res.status, 400);
      assert.equal(prisma.battleMatch.create.mock.calls.length, 0);
    });

    test('rejects a result value outside win/loss', async () => {
      const res = await request.post('/api/battle-history').send({ ...validMatchBody, result: 'draw' });

      assert.equal(res.status, 400);
      assert.equal(prisma.battleMatch.create.mock.calls.length, 0);
    });

    test('rejects non-array roundDetails/teamSnapshot', async () => {
      const res = await request
        .post('/api/battle-history')
        .send({ ...validMatchBody, roundDetails: 'not-an-array' });

      assert.equal(res.status, 400);
      assert.equal(prisma.battleMatch.create.mock.calls.length, 0);
    });

    test('rejects non-finite numeric fields', async () => {
      const res = await request.post('/api/battle-history').send({ ...validMatchBody, rounds: 'five' });

      assert.equal(res.status, 400);
      assert.equal(prisma.battleMatch.create.mock.calls.length, 0);
    });

    test('persists a complete, valid match scoped to the JWT user and returns 201', async () => {
      const res = await request.post('/api/battle-history').send(validMatchBody);

      assert.equal(res.status, 201);
      assert.deepEqual(res.body, { id: 1, createdAt: '2026-01-01T00:00:00.000Z' });
      const data = prisma.battleMatch.create.mock.calls[0].arguments[0].data;
      assert.equal(data.auth0UserId, FAKE_USER);
      assert.equal(data.roundsJson, JSON.stringify(validMatchBody.roundDetails));
      assert.equal(data.teamSnapshotJson, JSON.stringify(validMatchBody.teamSnapshot));
    });

    test('logs a real battle_completed event after the match is saved', async () => {
      await request.post('/api/battle-history').send(validMatchBody);

      assert.equal(analyticsEventService.logEventSafe.mock.calls.length, 1);
      assert.deepEqual(analyticsEventService.logEventSafe.mock.calls[0].arguments[0], {
        auth0UserId: FAKE_USER,
        eventType: 'battle_completed',
        metadata: { difficulty: 'hard', result: 'win', opponentType: 'fire' },
      });
    });

    test('never logs an event when the match record is rejected', async () => {
      const { opponentName, ...incomplete } = validMatchBody;
      await request.post('/api/battle-history').send(incomplete);

      assert.equal(analyticsEventService.logEventSafe.mock.calls.length, 0);
    });
  });
});
