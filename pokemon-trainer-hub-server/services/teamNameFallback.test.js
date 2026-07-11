const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  VALID_STYLES,
  buildFallbackNames,
  sanitizeNames,
  validateTeamNameValue,
} = require('./teamNameFallback');

const TEAM = [
  { pokemonName: 'charizard', types: ['fire', 'flying'], baseExperience: 267 },
  { pokemonName: 'blaziken', types: ['fire', 'fighting'], baseExperience: 284 },
  { pokemonName: 'pikachu', types: ['electric'], baseExperience: 112 },
];

test('VALID_STYLES contains exactly the 5 supported styles', () => {
  assert.deepEqual(VALID_STYLES, ['Epic', 'Competitive', 'Mysterious', 'Cute', 'Funny']);
});

test('buildFallbackNames returns exactly 3 distinct names', () => {
  const names = buildFallbackNames(TEAM, 'Epic');
  assert.equal(names.length, 3);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 3);
});

test("buildFallbackNames names the team's most common type", () => {
  const names = buildFallbackNames(TEAM, 'Epic');
  assert.ok(names.some((n) => n.toLowerCase().includes('fire')));
});

test('buildFallbackNames falls back to Epic words for an unknown style', () => {
  const epic = buildFallbackNames(TEAM, 'Epic');
  const unknown = buildFallbackNames(TEAM, 'NotAStyle');
  assert.deepEqual(unknown, epic);
});

test('buildFallbackNames handles an empty team without crashing', () => {
  const names = buildFallbackNames([], 'Cute');
  assert.equal(names.length, 3);
  assert.ok(names.every((n) => typeof n === 'string' && n.length > 0));
});

test('sanitizeNames accepts a valid 3-name AI response', () => {
  const clean = sanitizeNames(['Thunder Vanguard', 'Stormbound Five', 'Voltage Legends']);
  assert.deepEqual(clean, ['Thunder Vanguard', 'Stormbound Five', 'Voltage Legends']);
});

test('sanitizeNames rejects a response with duplicate names', () => {
  const clean = sanitizeNames(['Thunder Vanguard', 'thunder vanguard ', 'Voltage Legends']);
  assert.equal(clean, null);
});

test('sanitizeNames rejects a response containing a too-long name', () => {
  const tooLong = 'A'.repeat(41);
  const clean = sanitizeNames(['Thunder Vanguard', tooLong, 'Voltage Legends']);
  assert.equal(clean, null);
});

test('sanitizeNames trims whitespace and drops blank entries', () => {
  const clean = sanitizeNames(['  Thunder Vanguard  ', '   ', 'Stormbound Five', 'Voltage Legends']);
  assert.deepEqual(clean, ['Thunder Vanguard', 'Stormbound Five', 'Voltage Legends']);
});

test('sanitizeNames returns null for non-array input', () => {
  assert.equal(sanitizeNames(null), null);
  assert.equal(sanitizeNames(undefined), null);
});

test('validateTeamNameValue accepts a normal trimmed name', () => {
  assert.deepEqual(validateTeamNameValue('  Thunder Vanguard  '), { ok: true, name: 'Thunder Vanguard' });
});

test('validateTeamNameValue rejects a name that is too short', () => {
  const result = validateTeamNameValue('A');
  assert.equal(result.ok, false);
});

test('validateTeamNameValue rejects a name that is too long', () => {
  const result = validateTeamNameValue('A'.repeat(41));
  assert.equal(result.ok, false);
});

test('validateTeamNameValue rejects control characters', () => {
  const result = validateTeamNameValue('Thunder\x00Vanguard');
  assert.equal(result.ok, false);
});

test('validateTeamNameValue rejects non-string input', () => {
  const result = validateTeamNameValue(42);
  assert.equal(result.ok, false);
});
