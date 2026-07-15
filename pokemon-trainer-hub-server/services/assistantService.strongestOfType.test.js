const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Separate file from assistantService.test.js: that file already does a
// flat, top-level `require('./assistantService')` with the real
// services/pokeapi.js, so mock.module here would arrive too late to affect
// it. This file controls the require order itself instead, to verify that
// assistantService.getStrongestOfType(type) still returns exactly what it
// did before — a single full Pokémon or null — even though its internals
// now delegate to pokeapi.js's cached, ranked getStrongestOfType(type, limit).
describe('assistantService.getStrongestOfType (external shape preserved)', () => {
  let assistantService;
  let pokeapi;

  before(() => {
    pokeapi = {
      getStrongestOfType: mock.fn(),
      fetchPokemonDetail: mock.fn(),
    };
    mock.module(path.resolve(__dirname, './pokeapi.js'), { exports: pokeapi });
    assistantService = require('./assistantService');
  });

  beforeEach(() => {
    pokeapi.getStrongestOfType.mock.resetCalls();
    pokeapi.fetchPokemonDetail.mock.resetCalls();
  });

  test('asks pokeapi.getStrongestOfType for exactly the top 1, then returns its full detail', async () => {
    pokeapi.getStrongestOfType.mock.mockImplementationOnce(async () => [
      { id: 6, name: 'charizard', baseExperience: 267 },
    ]);
    const fullDetail = { id: 6, name: 'charizard', baseExperience: 267, stats: [], types: ['fire', 'flying'] };
    pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => fullDetail);

    const result = await assistantService.getStrongestOfType('fire');

    assert.deepEqual(pokeapi.getStrongestOfType.mock.calls[0].arguments, ['fire', 1]);
    assert.deepEqual(pokeapi.fetchPokemonDetail.mock.calls[0].arguments, [6]);
    assert.deepEqual(result, fullDetail);
  });

  test('returns null when the ranking comes back empty (e.g. unknown type)', async () => {
    pokeapi.getStrongestOfType.mock.mockImplementationOnce(async () => null);

    const result = await assistantService.getStrongestOfType('not-a-real-type');

    assert.equal(result, null);
    assert.equal(pokeapi.fetchPokemonDetail.mock.calls.length, 0);
  });
});
