const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('./rateLimiter');

test('createRateLimiter allows up to maxRequests for a key', () => {
  const limiter = createRateLimiter({ windowSeconds: 3600, maxRequests: 5 });
  const key = 'user-a';

  for (let i = 0; i < 5; i += 1) {
    assert.equal(limiter.consume(key), true);
  }
});

test('createRateLimiter blocks the request after maxRequests is reached', () => {
  const limiter = createRateLimiter({ windowSeconds: 3600, maxRequests: 2 });
  const key = 'user-b';

  assert.equal(limiter.consume(key), true);
  assert.equal(limiter.consume(key), true);
  assert.equal(limiter.consume(key), false);
});

test('createRateLimiter tracks each key independently', () => {
  const limiter = createRateLimiter({ windowSeconds: 3600, maxRequests: 1 });

  assert.equal(limiter.consume('user-c'), true);
  assert.equal(limiter.consume('user-d'), true);
  assert.equal(limiter.consume('user-c'), false);
  assert.equal(limiter.consume('user-d'), false);
});
