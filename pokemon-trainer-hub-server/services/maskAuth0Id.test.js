const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { maskAuth0Id } = require('./maskAuth0Id');

describe('services/maskAuth0Id', () => {
  test('masks a real auth0| id, keeping the provider prefix', () => {
    const masked = maskAuth0Id('auth0|64f2b3c1a9d8e7f6');
    assert.notEqual(masked, 'auth0|64f2b3c1a9d8e7f6');
    assert.ok(masked.startsWith('auth0|'));
    assert.equal(masked, 'auth0|64f2…e7f6');
  });

  test('masks a google-oauth2| id the same way', () => {
    const masked = maskAuth0Id('google-oauth2|1234567890123456');
    assert.ok(masked.startsWith('google-oauth2|'));
    assert.notEqual(masked, 'google-oauth2|1234567890123456');
  });

  test('never returns the full raw id for a long id with no provider prefix', () => {
    const masked = maskAuth0Id('abcdefghijklmnop');
    assert.notEqual(masked, 'abcdefghijklmnop');
  });

  test('returns a short id unchanged rather than masking to nothing', () => {
    assert.equal(maskAuth0Id('short'), 'short');
  });
});
