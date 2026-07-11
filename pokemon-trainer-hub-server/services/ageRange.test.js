const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateAge, calculateAgeRange, MIN_AGE } = require('./ageRange');

// Fixed "now" so every test is deterministic regardless of when it runs.
const NOW = new Date('2026-07-11T00:00:00.000Z');

test('MIN_AGE is 13', () => {
  assert.equal(MIN_AGE, 13);
});

test('calculateAge computes a whole number of years', () => {
  assert.equal(calculateAge(new Date('2001-07-11T00:00:00.000Z'), NOW), 25);
});

test("calculateAge doesn't count this year's birthday until it's passed", () => {
  assert.equal(calculateAge(new Date('2001-07-13T00:00:00.000Z'), NOW), 24);
});

test('calculateAgeRange buckets a 13-17 year old', () => {
  assert.equal(calculateAgeRange(new Date('2011-01-01T00:00:00.000Z'), NOW), '13-17');
});

test('calculateAgeRange buckets an 18-24 year old', () => {
  assert.equal(calculateAgeRange(new Date('2005-01-01T00:00:00.000Z'), NOW), '18-24');
});

test('calculateAgeRange buckets a 25-34 year old', () => {
  assert.equal(calculateAgeRange(new Date('1995-01-01T00:00:00.000Z'), NOW), '25-34');
});

test('calculateAgeRange buckets a 35+ year old', () => {
  assert.equal(calculateAgeRange(new Date('1980-01-01T00:00:00.000Z'), NOW), '35+');
});
