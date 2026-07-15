const { describe, test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// pokeapi.js calls the global `fetch` directly (no injection point) — these
// tests stub `global.fetch` itself rather than adding test-only dependency
// injection to production code, which would be an unrelated change.
// pokeCache is a module-level singleton, so each test below uses its own
// unique type name as a cache key instead of resetting the module between
// tests (which would require re-requiring it, defeating the singleton).
describe('services/pokeapi — getStrongestRankedList / getStrongestOfType', () => {
  let pokeapi;
  let fetchMock;

  before(() => {
    fetchMock = mock.method(global, 'fetch');
    pokeapi = require('./pokeapi');
  });

  after(() => {
    fetchMock.mock.restore();
  });

  beforeEach(() => {
    fetchMock.mock.resetCalls();
  });

  function typeListPayload(entries) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        pokemon: entries.map(({ id, name }) => ({
          pokemon: { name, url: `https://pokeapi.co/api/v2/pokemon/${id}/` },
        })),
      }),
    };
  }

  function pokemonDetailPayload({ id, name, baseExperience }) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id,
        name,
        base_experience: baseExperience,
        stats: [],
        types: [{ type: { name: 'normal' } }],
        abilities: [],
        sprites: { other: {}, front_default: null },
        cries: {},
        height: 1,
        weight: 1,
      }),
    };
  }

  // Wires the fetch mock for a given type -> candidate list, resolving each
  // candidate's detail from `byId`. Every test below uses its own type name
  // so cache entries never collide with another test.
  function wireFetch(entries, byId) {
    fetchMock.mock.mockImplementation(async (url) => {
      const s = String(url);
      if (s.includes('/type/')) {
        return s.endsWith('/type/missing-type') ? { ok: false, status: 404 } : typeListPayload(entries);
      }
      const id = Number(s.match(/\/pokemon\/(\d+)/)[1]);
      const data = byId[id];
      return data ? pokemonDetailPayload(data) : { ok: false, status: 404 };
    });
  }

  test('ranks candidates by baseExperience descending, id ascending as a tie-breaker', async () => {
    const entries = [{ id: 101, name: 'a' }, { id: 102, name: 'b' }, { id: 103, name: 'c' }];
    wireFetch(entries, {
      101: { id: 101, name: 'a', baseExperience: 50 },
      102: { id: 102, name: 'b', baseExperience: 100 },
      103: { id: 103, name: 'c', baseExperience: 100 },
    });

    const ranked = await pokeapi.getStrongestRankedList('rank-order-type');

    assert.deepEqual(ranked.map((p) => p.id), [102, 103, 101]);
  });

  test('getStrongestOfType respects a requested limit', async () => {
    const entries = [{ id: 201, name: 'a' }, { id: 202, name: 'b' }, { id: 203, name: 'c' }];
    wireFetch(entries, {
      201: { id: 201, name: 'a', baseExperience: 10 },
      202: { id: 202, name: 'b', baseExperience: 30 },
      203: { id: 203, name: 'c', baseExperience: 20 },
    });

    const top2 = await pokeapi.getStrongestOfType('limit-respect-type', 2);

    assert.deepEqual(top2.map((p) => p.id), [202, 203]);
  });

  test('getStrongestOfType clamps an excessive limit to the safe maximum', async () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({ id: 300 + i, name: `mon-${i}` }));
    const byId = Object.fromEntries(
      entries.map(({ id }, i) => [id, { id, name: `mon-${i}`, baseExperience: i }]),
    );
    wireFetch(entries, byId);

    const result = await pokeapi.getStrongestOfType('limit-clamp-type', 1000);

    assert.equal(result.length, 20); // STRONGEST_LIMIT_MAX, not 1000 and not all 25
  });

  test('an invalid (non-positive) limit falls back to the default of 5', async () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({ id: 400 + i, name: `mon-${i}` }));
    const byId = Object.fromEntries(
      entries.map(({ id }, i) => [id, { id, name: `mon-${i}`, baseExperience: i }]),
    );
    wireFetch(entries, byId);

    const result = await pokeapi.getStrongestOfType('limit-invalid-type', -3);

    assert.equal(result.length, 5);
  });

  test('a cached ranking is reused instead of rebuilt on a second call', async () => {
    const entries = [{ id: 500, name: 'a' }, { id: 501, name: 'b' }];
    wireFetch(entries, {
      500: { id: 500, name: 'a', baseExperience: 10 },
      501: { id: 501, name: 'b', baseExperience: 20 },
    });

    const first = await pokeapi.getStrongestRankedList('cache-reuse-type');
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await pokeapi.getStrongestRankedList('cache-reuse-type');

    assert.deepEqual(second, first);
    assert.equal(fetchMock.mock.calls.length, callsAfterFirst); // no new fetch calls at all
  });

  test('two concurrent requests for the same uncached type share one in-flight computation', async () => {
    const entries = [{ id: 600, name: 'a' }, { id: 601, name: 'b' }];
    wireFetch(entries, {
      600: { id: 600, name: 'a', baseExperience: 10 },
      601: { id: 601, name: 'b', baseExperience: 20 },
    });

    const [a, b] = await Promise.all([
      pokeapi.getStrongestRankedList('concurrent-dedupe-type'),
      pokeapi.getStrongestRankedList('concurrent-dedupe-type'),
    ]);

    assert.deepEqual(a, b);
    // 1 call for /type/ + 1 call per candidate detail (2) = 3, not 6 — proof
    // the second caller reused the first's in-flight Promise.
    assert.equal(fetchMock.mock.calls.length, 3);
  });

  test('a failed computation clears the in-flight entry and allows a later retry to succeed', async () => {
    const failingType = 'retry-after-failure-type';
    fetchMock.mock.mockImplementationOnce(async () => {
      throw new Error('network down');
    });

    await assert.rejects(() => pokeapi.getStrongestRankedList(failingType));

    // Now wire a real, successful response for the retry.
    wireFetch([{ id: 700, name: 'a' }], { 700: { id: 700, name: 'a', baseExperience: 5 } });

    const retried = await pokeapi.getStrongestRankedList(failingType);
    assert.deepEqual(retried.map((p) => p.id), [700]);
  });

  test('returns null for an unknown type without throwing', async () => {
    wireFetch([], {});
    const result = await pokeapi.getStrongestOfType('missing-type');
    assert.equal(result, null);
  });
});
