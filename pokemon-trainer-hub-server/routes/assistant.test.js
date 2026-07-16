const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/assistant', () => {
  let request;
  let teamService;
  let assistantService;
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

    teamService = { getTeam: mock.fn(async () => [{ pokemonId: 25 }]) };
    mock.module(path.resolve(__dirname, '../services/teamService.js'), { exports: { default: teamService } });

    assistantService = {
      analyzeTeam: mock.fn(async () => ({ type: 'electric', reasoning: 'Balanced team.' })),
      queryDescription: mock.fn(async () => ({ type: 'fire', reasoning: 'Sounds fiery.' })),
      getStrongestOfType: mock.fn(async () => ({ id: 6, name: 'charizard' })),
      chatWithAssistant: mock.fn(async () => ({ reply: 'Hi there!' })),
      generateTeamNames: mock.fn(async () => ({ names: ['Thunder Squad'] })),
      isRateLimitError: mock.fn(() => false),
      VALID_STYLES: ['Epic', 'Funny', 'Classic'],
    };
    mock.module(path.resolve(__dirname, '../services/assistantService.js'), {
      exports: { default: assistantService },
    });

    rateLimiter = { consume: mock.fn(() => true) };
    mock.module(path.resolve(__dirname, '../services/rateLimiter.js'), {
      exports: { createRateLimiter: () => rateLimiter },
    });

    const express = require('express');
    const supertest = require('supertest');
    const assistantRouter = require('./assistant');

    const app = express();
    app.use(express.json());
    app.use('/api/assistant', assistantRouter);
    request = supertest(app);
  });

  function resetAll() {
    teamService.getTeam.mock.resetCalls();
    assistantService.analyzeTeam.mock.resetCalls();
    assistantService.queryDescription.mock.resetCalls();
    assistantService.getStrongestOfType.mock.resetCalls();
    assistantService.chatWithAssistant.mock.resetCalls();
    assistantService.generateTeamNames.mock.resetCalls();
    assistantService.isRateLimitError.mock.resetCalls();
    rateLimiter.consume.mock.resetCalls();
  }

  beforeEach(() => {
    resetAll();
    teamService.getTeam.mock.mockImplementation(async () => [{ pokemonId: 25 }]);
    assistantService.analyzeTeam.mock.mockImplementation(async () => ({ type: 'electric', reasoning: 'Balanced team.' }));
    assistantService.queryDescription.mock.mockImplementation(async () => ({ type: 'fire', reasoning: 'Sounds fiery.' }));
    assistantService.getStrongestOfType.mock.mockImplementation(async () => ({ id: 6, name: 'charizard' }));
    assistantService.chatWithAssistant.mock.mockImplementation(async () => ({ reply: 'Hi there!' }));
    assistantService.generateTeamNames.mock.mockImplementation(async () => ({ names: ['Thunder Squad'] }));
    assistantService.isRateLimitError.mock.mockImplementation(() => false);
    rateLimiter.consume.mock.mockImplementation(() => true);
  });

  describe('POST /analyze', () => {
    test('analyzes the JWT-identified team and resolves the recommended type to a real Pokémon', async () => {
      const res = await request.post('/api/assistant/analyze');

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { type: 'electric', reasoning: 'Balanced team.', pokemon: { id: 6, name: 'charizard' } });
      assert.equal(teamService.getTeam.mock.calls[0].arguments[0], FAKE_USER);
      assert.equal(assistantService.getStrongestOfType.mock.calls[0].arguments[0], 'electric');
    });

    test('maps a rate-limit error to 503', async () => {
      assistantService.analyzeTeam.mock.mockImplementationOnce(async () => {
        throw new Error('rate limited');
      });
      assistantService.isRateLimitError.mock.mockImplementationOnce(() => true);

      const res = await request.post('/api/assistant/analyze');
      assert.equal(res.status, 503);
    });

    test('maps any other failure to 502', async () => {
      assistantService.analyzeTeam.mock.mockImplementationOnce(async () => {
        throw new Error('model down');
      });

      const res = await request.post('/api/assistant/analyze');
      assert.equal(res.status, 502);
    });
  });

  describe('POST /query', () => {
    test('rejects an empty description', async () => {
      const res = await request.post('/api/assistant/query').send({ text: '   ' });

      assert.equal(res.status, 400);
      assert.equal(assistantService.queryDescription.mock.calls.length, 0);
    });

    test('resolves a described type to a real Pokémon', async () => {
      const res = await request.post('/api/assistant/query').send({ text: 'a strong fire type' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { type: 'fire', reasoning: 'Sounds fiery.', pokemon: { id: 6, name: 'charizard' } });
    });

    test('maps a rate-limit error to 503', async () => {
      assistantService.queryDescription.mock.mockImplementationOnce(async () => {
        throw new Error('rate limited');
      });
      assistantService.isRateLimitError.mock.mockImplementationOnce(() => true);

      const res = await request.post('/api/assistant/query').send({ text: 'a strong fire type' });
      assert.equal(res.status, 503);
    });
  });

  describe('POST /chat', () => {
    test('rejects an empty messages array', async () => {
      const res = await request.post('/api/assistant/chat').send({ messages: [] });
      assert.equal(res.status, 400);
    });

    test('rejects a malformed message (bad role or non-string text)', async () => {
      const res = await request.post('/api/assistant/chat').send({ messages: [{ role: 'admin', text: 'hi' }] });
      assert.equal(res.status, 400);
    });

    test('replies for a valid message history', async () => {
      const res = await request
        .post('/api/assistant/chat')
        .send({ messages: [{ role: 'user', text: 'hi' }] });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { reply: 'Hi there!' });
    });
  });

  describe('POST /team-name', () => {
    test('rejects a style outside VALID_STYLES', async () => {
      const res = await request.post('/api/assistant/team-name').send({ style: 'Weird' });

      assert.equal(res.status, 400);
      assert.equal(rateLimiter.consume.mock.calls.length, 0);
    });

    test('returns 429 once the rate limiter denies the request', async () => {
      rateLimiter.consume.mock.mockImplementationOnce(() => false);

      const res = await request.post('/api/assistant/team-name').send({ style: 'Epic' });

      assert.equal(res.status, 429);
      assert.equal(teamService.getTeam.mock.calls.length, 0);
    });

    test('rejects generating a name for an empty team', async () => {
      teamService.getTeam.mock.mockImplementationOnce(async () => []);

      const res = await request.post('/api/assistant/team-name').send({ style: 'Epic' });

      assert.equal(res.status, 400);
      assert.equal(assistantService.generateTeamNames.mock.calls.length, 0);
    });

    test('generates names for a non-empty team', async () => {
      const res = await request.post('/api/assistant/team-name').send({ style: 'Epic' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { names: ['Thunder Squad'] });
      assert.deepEqual(assistantService.generateTeamNames.mock.calls[0].arguments, [[{ pokemonId: 25 }], 'Epic']);
    });
  });
});
