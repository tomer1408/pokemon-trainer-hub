const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Route-level tests: exercise the real Express router, but with jwtCheck and
// services/pokeapi.js swapped for test doubles — so these never touch a real
// Auth0 tenant or a real PokeAPI/network call.
describe('routes/pokemon', () => {
  let request;
  let pokeapi;

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: { sub: 'auth0|test-user' } };
          next();
        },
      },
    });

    pokeapi = {
      fetchPokemonDetail: mock.fn(async (id) => ({
        id,
        name: `mon-${id}`,
        baseExperience: id,
        types: ['fire'],
        stats: [],
        spriteUrl: null,
      })),
      fetchPokemonFullDetail: mock.fn(),
      getMasterList: mock.fn(async () => [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]),
      getListByType: mock.fn(async (type) =>
        type === 'unknown-type' ? null : [{ id: 4, name: 'charmander' }, { id: 5, name: 'charmeleon' }],
      ),
      getTypeChart: mock.fn(),
    };
    mock.module(path.resolve(__dirname, '../services/pokeapi.js'), { exports: pokeapi });

    const express = require('express');
    const supertest = require('supertest');
    const pokemonRouter = require('./pokemon');

    const app = express();
    app.use(express.json());
    app.use('/api/pokemon', pokemonRouter);
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({ message: 'Something went wrong on our end.' });
    });

    request = supertest(app);
  });

  beforeEach(() => {
    pokeapi.fetchPokemonDetail.mock.resetCalls();
    pokeapi.getMasterList.mock.resetCalls();
    pokeapi.getListByType.mock.resetCalls();
  });

  test('GET /?sort=strongest without a type is rejected with 400 before any lookup runs', async () => {
    const res = await request.get('/api/pokemon?sort=strongest');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: 'Sorting by strongest requires a type filter.' });
    assert.equal(pokeapi.getMasterList.mock.calls.length, 0);
    assert.equal(pokeapi.getListByType.mock.calls.length, 0);
    assert.equal(pokeapi.fetchPokemonDetail.mock.calls.length, 0);
  });

  test('GET /?sort=strongest&search=... without a type is still rejected — only type satisfies the guard', async () => {
    const res = await request.get('/api/pokemon?sort=strongest&search=char');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: 'Sorting by strongest requires a type filter.' });
  });

  test('GET /?sort=strongest&type=... sorts the type-scoped candidates by baseExperience, descending', async () => {
    const res = await request.get('/api/pokemon?sort=strongest&type=fire');

    assert.equal(res.status, 200);
    assert.deepEqual(pokeapi.getListByType.mock.calls[0].arguments, ['fire']);
    // fetchPokemonDetail called once to score every type candidate, then
    // again per-page to build the actual response — ids 4 and 5 both appear
    // in both passes, so 4 total calls for these 2 candidates.
    assert.equal(pokeapi.fetchPokemonDetail.mock.calls.length, 4);
    assert.deepEqual(
      res.body.results.map((p) => p.id),
      [5, 4], // higher baseExperience (mocked as === id) first
    );
    assert.equal(res.body.total, 2);
  });

  test('GET /?sort=strongest&type=unknown-type returns 400 for an unrecognized type, same as any other sort', async () => {
    const res = await request.get('/api/pokemon?sort=strongest&type=unknown-type');

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Unknown type "unknown-type".');
  });
});
