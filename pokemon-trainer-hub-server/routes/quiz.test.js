const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/quiz', () => {
  let request;
  let pokeapi;
  const FAKE_USER = 'auth0|test-user';

  function detailFor(id) {
    return { id, name: `mon-${id}`, types: ['fire'], spriteUrl: `sprite-${id}`, baseExperience: 100 };
  }

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: { sub: FAKE_USER } };
          next();
        },
      },
    });

    pokeapi = {
      getMasterList: mock.fn(async () => [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]),
      fetchPokemonDetail: mock.fn(async (id) => detailFor(id)),
    };
    mock.module(path.resolve(__dirname, '../services/pokeapi.js'), { exports: pokeapi });

    const express = require('express');
    const supertest = require('supertest');
    const quizRouter = require('./quiz');

    const app = express();
    app.use('/api/quiz', quizRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    pokeapi.getMasterList.mock.resetCalls();
    pokeapi.fetchPokemonDetail.mock.resetCalls();
    pokeapi.getMasterList.mock.mockImplementation(async () => [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    pokeapi.fetchPokemonDetail.mock.mockImplementation(async (id) => detailFor(id));
  });

  test('GET /round returns a target plus exactly 3 distractor options, all real and distinct', async () => {
    const res = await request.get('/api/quiz/round');

    assert.equal(res.status, 200);
    assert.ok(res.body.target);
    assert.equal(res.body.options.length, 4);

    const optionIds = res.body.options.map((o) => o.id);
    assert.equal(new Set(optionIds).size, 4); // all distinct
    assert.ok(optionIds.includes(res.body.target.id)); // target is one of the options
  });

  test('GET /round returns 502 when fewer than 4 candidates resolve successfully', async () => {
    let call = 0;
    pokeapi.fetchPokemonDetail.mock.mockImplementation(async (id) => {
      call += 1;
      if (call > 2) throw new Error('PokeAPI down');
      return detailFor(id);
    });

    const res = await request.get('/api/quiz/round');

    assert.equal(res.status, 502);
  });
});
