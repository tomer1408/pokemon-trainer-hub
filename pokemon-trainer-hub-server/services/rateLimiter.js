const NodeCache = require('node-cache');

// Simple per-key request counter, backed by the same node-cache pattern
// already used for PokeAPI caching (services/pokeapi.js) — no new
// dependency needed for a lightweight, single-instance rate limit.
function createRateLimiter({ windowSeconds, maxRequests }) {
  const cache = new NodeCache({ stdTTL: windowSeconds });

  return {
    // Returns true and records the request if the key is still under
    // maxRequests within the current window; false if it's already hit
    // the limit. Each call refreshes the key's TTL to windowSeconds, so a
    // key naturally expires (and the count resets to 0) once a full window
    // passes without any further requests.
    consume(key) {
      const count = cache.get(key) || 0;
      if (count >= maxRequests) return false;
      cache.set(key, count + 1);
      return true;
    },
  };
}

module.exports = { createRateLimiter };
