const { describe, test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const requirePurgeSecret = require('./requirePurgeSecret');

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('middleware/requirePurgeSecret', () => {
  const originalSecret = process.env.PURGE_SWEEP_SECRET;

  afterEach(() => {
    process.env.PURGE_SWEEP_SECRET = originalSecret;
  });

  test('responds 401 when PURGE_SWEEP_SECRET is not configured at all, even with a header sent', () => {
    delete process.env.PURGE_SWEEP_SECRET;
    const req = { get: () => 'anything' };
    const res = fakeRes();
    const next = mock.fn();

    requirePurgeSecret(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  test('responds 401 when no header is sent', () => {
    process.env.PURGE_SWEEP_SECRET = 'real-secret';
    const req = { get: () => undefined };
    const res = fakeRes();
    const next = mock.fn();

    requirePurgeSecret(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  test('responds 401 when the header does not match', () => {
    process.env.PURGE_SWEEP_SECRET = 'real-secret';
    const req = { get: () => 'wrong-secret' };
    const res = fakeRes();
    const next = mock.fn();

    requirePurgeSecret(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  test('calls next() when the header matches the real configured secret', () => {
    process.env.PURGE_SWEEP_SECRET = 'real-secret';
    const req = { get: () => 'real-secret' };
    const res = fakeRes();
    const next = mock.fn();

    requirePurgeSecret(req, res, next);

    assert.equal(next.mock.calls.length, 1);
    assert.equal(res.statusCode, null);
  });

  test('responds 401 (not a crash) when the header is the same length as the secret but different content — exercises the timingSafeEqual path, not just the length short-circuit', () => {
    process.env.PURGE_SWEEP_SECRET = 'real-secret'; // 11 chars
    const req = { get: () => 'reel-secret' }; // 11 chars, one char different
    const res = fakeRes();
    const next = mock.fn();

    requirePurgeSecret(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  test('the 401 response is identical in shape whether the secret is missing, wrong, or unconfigured — never reveals which case occurred', () => {
    const bodies = [];

    delete process.env.PURGE_SWEEP_SECRET;
    let res = fakeRes();
    requirePurgeSecret({ get: () => undefined }, res, mock.fn());
    bodies.push(res.body);

    process.env.PURGE_SWEEP_SECRET = 'real-secret';
    res = fakeRes();
    requirePurgeSecret({ get: () => 'totally-wrong' }, res, mock.fn());
    bodies.push(res.body);

    assert.deepEqual(bodies[0], bodies[1]);
  });
});
