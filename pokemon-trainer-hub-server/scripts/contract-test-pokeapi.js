// Contract test against the REAL PokeAPI — deliberately not part of `npm
// test` (that suite must never touch a live network call). Run manually:
//
//   node scripts/contract-test-pokeapi.js
//
// This project deliberately never mirrors PokeAPI's data into our own DB
// (see CLAUDE.md / README) — every screen depends on PokeAPI's response
// shape staying what services/pokeapi.js's parsing code assumes it is. This
// script hits a handful of real, stable endpoints and asserts the exact
// field paths that code actually reads still exist with the expected type,
// so an upstream PokeAPI shape change gets caught deliberately instead of
// surfacing later as a confusing null/undefined somewhere in the app.
const assert = require('node:assert/strict');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ok — ${label}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAILED — ${label}\n    ${err.message}`);
    failed += 1;
  }
}

function isType(value, type) {
  assert.equal(typeof value, type);
}

async function fetchJson(path) {
  const response = await fetch(`${POKEAPI_BASE}${path}`);
  assert.equal(response.ok, true, `expected a 2xx response for ${path}, got ${response.status}`);
  return response.json();
}

// Mirrors exactly the field paths fetchPokemonDetail() reads (services/pokeapi.js).
async function checkPokemonDetailShape() {
  const data = await fetchJson('/pokemon/pikachu');

  isType(data.id, 'number');
  isType(data.name, 'string');
  isType(data.base_experience, 'number');
  assert.ok(Array.isArray(data.stats) && data.stats.length > 0);
  isType(data.stats[0].stat.name, 'string');
  isType(data.stats[0].base_stat, 'number');
  assert.ok(Array.isArray(data.types) && data.types.length > 0);
  isType(data.types[0].type.name, 'string');
  assert.ok(Array.isArray(data.abilities) && data.abilities.length > 0);
  isType(data.abilities[0].ability.name, 'string');
  assert.ok(data.sprites, 'sprites object missing');
  assert.ok(
    data.sprites.other?.['official-artwork']?.front_default || data.sprites.front_default,
    'no usable sprite URL (neither official-artwork nor front_default present)',
  );
  isType(data.height, 'number');
  isType(data.weight, 'number');
}

// Mirrors fetchSpeciesFlavorText().
async function checkSpeciesShape() {
  const data = await fetchJson('/pokemon-species/pikachu');
  assert.ok(Array.isArray(data.flavor_text_entries) && data.flavor_text_entries.length > 0);
  const enEntry = data.flavor_text_entries.find((e) => e.language.name === 'en');
  assert.ok(enEntry, 'no English flavor_text_entries found at all');
  isType(enEntry.flavor_text, 'string');
}

// Mirrors fetchSingleTypeMatchup() / getTypeChart().
async function checkTypeMatchupShape() {
  const data = await fetchJson('/type/fire');
  assert.ok(data.damage_relations);
  for (const key of ['double_damage_from', 'half_damage_from', 'no_damage_from', 'double_damage_to']) {
    assert.ok(Array.isArray(data.damage_relations[key]), `damage_relations.${key} is not an array`);
  }
  assert.ok(Array.isArray(data.pokemon) && data.pokemon.length > 0);
  isType(data.pokemon[0].pokemon.name, 'string');
  isType(data.pokemon[0].pokemon.url, 'string');
  assert.match(data.pokemon[0].pokemon.url, /\/pokemon\/\d+\//);
}

// Mirrors fetchAbilityDescription().
async function checkAbilityShape() {
  const data = await fetchJson('/ability/static');
  assert.ok(Array.isArray(data.effect_entries) && data.effect_entries.length > 0);
  const enEntry = data.effect_entries.find((e) => e.language.name === 'en');
  assert.ok(enEntry, 'no English effect_entries found at all');
  assert.ok(typeof enEntry.short_effect === 'string' || typeof enEntry.effect === 'string');
}

// Mirrors fetchMoveDetail().
async function checkMoveShape() {
  const data = await fetchJson('/move/tackle');
  isType(data.name, 'string');
  isType(data.type.name, 'string');
  assert.ok(data.power === null || typeof data.power === 'number');
}

// Mirrors getMasterList().
async function checkMasterListShape() {
  const data = await fetchJson('/pokemon?limit=1');
  isType(data.count, 'number');
  assert.ok(data.count > 1300, `expected PokeAPI's total count to still be 1300+, got ${data.count}`);
  assert.ok(Array.isArray(data.results) && data.results.length === 1);
  isType(data.results[0].name, 'string');
  isType(data.results[0].url, 'string');
  assert.match(data.results[0].url, /\/pokemon\/\d+\//);
}

(async () => {
  console.log('Running PokeAPI contract checks against the real, live API...\n');

  await check('GET /pokemon/pikachu matches fetchPokemonDetail()\'s expected shape', checkPokemonDetailShape);
  await check('GET /pokemon-species/pikachu matches fetchSpeciesFlavorText()\'s expected shape', checkSpeciesShape);
  await check('GET /type/fire matches fetchSingleTypeMatchup()\'s expected shape', checkTypeMatchupShape);
  await check('GET /ability/static matches fetchAbilityDescription()\'s expected shape', checkAbilityShape);
  await check('GET /move/tackle matches fetchMoveDetail()\'s expected shape', checkMoveShape);
  await check('GET /pokemon?limit=1 matches getMasterList()\'s expected shape', checkMasterListShape);

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
})();
