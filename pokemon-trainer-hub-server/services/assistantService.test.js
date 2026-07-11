const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateTeamNames } = require('./assistantService');

const TEAM = [
  { pokemonName: 'charizard', types: ['fire', 'flying'], baseExperience: 267 },
  { pokemonName: 'blaziken', types: ['fire', 'fighting'], baseExperience: 284 },
];

test('generateTeamNames returns the AI names when the model gives a valid response', async () => {
  const result = await generateTeamNames(TEAM, 'Epic', {
    invoke: async () => ({ names: ['Thunder Vanguard', 'Stormbound Five', 'Voltage Legends'] }),
  });
  assert.deepEqual(result, {
    names: ['Thunder Vanguard', 'Stormbound Five', 'Voltage Legends'],
    source: 'ai',
  });
});

test('generateTeamNames falls back when the model returns duplicate names', async () => {
  const result = await generateTeamNames(TEAM, 'Epic', {
    invoke: async () => ({ names: ['Thunder Vanguard', 'Thunder Vanguard', 'Voltage Legends'] }),
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.names.length, 3);
});

test('generateTeamNames falls back when the model returns a too-long name', async () => {
  const result = await generateTeamNames(TEAM, 'Epic', {
    invoke: async () => ({ names: ['A'.repeat(41), 'Stormbound Five', 'Voltage Legends'] }),
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.names.length, 3);
});

test('generateTeamNames falls back when the model throws (Gemini error)', async () => {
  const result = await generateTeamNames(TEAM, 'Epic', {
    invoke: async () => {
      throw new Error('503 Service Unavailable');
    },
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.names.length, 3);
});

test('generateTeamNames falls back when the model reaches its quota', async () => {
  const result = await generateTeamNames(TEAM, 'Epic', {
    invoke: async () => {
      throw new Error('429 Too Many Requests: quota exceeded');
    },
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.names.length, 3);
});

test('generateTeamNames falls back when the model call times out', async () => {
  const result = await generateTeamNames(TEAM, 'Epic', {
    invoke: () => new Promise(() => {}), // never resolves
    timeoutMs: 20,
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.names.length, 3);
});

test('generateTeamNames treats an invalid style as Epic instead of failing', async () => {
  const result = await generateTeamNames(TEAM, 'NotAStyle', {
    invoke: async () => ({ names: ['Thunder Vanguard', 'Stormbound Five', 'Voltage Legends'] }),
  });
  assert.equal(result.source, 'ai');
});
