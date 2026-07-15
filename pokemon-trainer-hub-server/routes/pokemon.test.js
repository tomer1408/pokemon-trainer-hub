const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Route-level tests: exercise the real Express router, but with jwtCheck and
// services/pokeapi.js swapped for test doubles — so these never touch a real
// Auth0 tenant or a real PokeAPI/network call. The actual ranking logic
// (sort/tie-break/cache/dedupe) lives in services/pokeapi.js and is covered
// by services/pokeapi.test.js instead — these tests only check that the
// route wires the guard and the dedicated function correctly.
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
      getStrongestRankedList: mock.fn(async () => [
        { id: 5, name: 'charmeleon', baseExperience: 142 },
        { id: 4, name: 'charmander', baseExperience: 62 },
      ]),
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
    pokeapi.getStrongestRankedList.mock.resetCalls();
  });

  test('GET /?sort=strongest without a type is rejected with 400 before any lookup runs', async () => {
    const res = await request.get('/api/pokemon?sort=strongest');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: 'Sorting by strongest requires a type filter.' });
    assert.equal(pokeapi.getMasterList.mock.calls.length, 0);
    assert.equal(pokeapi.getListByType.mock.calls.length, 0);
    assert.equal(pokeapi.getStrongestRankedList.mock.calls.length, 0);
  });

  test('GET /?sort=strongest&search=... without a type is still rejected — only type satisfies the guard', async () => {
    const res = await request.get('/api/pokemon?sort=strongest&search=char');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: 'Sorting by strongest requires a type filter.' });
  });

  test('GET /?sort=strongest&type=... delegates ranking to the dedicated getStrongestRankedList', async () => {
    const res = await request.get('/api/pokemon?sort=strongest&type=fire');

    assert.equal(res.status, 200);
    assert.deepEqual(pokeapi.getStrongestRankedList.mock.calls[0].arguments, ['fire']);
    // The route's final per-page detail fetch is the only thing still
    // calling fetchPokemonDetail directly here — the ranking itself is
    // fully delegated (and mocked out) via getStrongestRankedList, so this
    // is exactly 2 calls (one per candidate on this single page), not 4.
    assert.equal(pokeapi.fetchPokemonDetail.mock.calls.length, 2);
    assert.deepEqual(
      res.body.results.map((p) => p.id),
      [5, 4], // pre-ranked order returned as-is by the mock
    );
    assert.equal(res.body.total, 2);
  });

  test('GET /?sort=strongest&type=...&search=... re-filters the ranked list by name', async () => {
    const res = await request.get('/api/pokemon?sort=strongest&type=fire&search=meleon');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.results.map((p) => p.id), [5]); // only "charmeleon" matches
    assert.equal(res.body.total, 1);
  });

  test('GET /?sort=strongest&type=unknown-type returns 400 for an unrecognized type, same as any other sort', async () => {
    const res = await request.get('/api/pokemon?sort=strongest&type=unknown-type');

    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Unknown type "unknown-type".');
    assert.equal(pokeapi.getStrongestRankedList.mock.calls.length, 0);
  });
});
