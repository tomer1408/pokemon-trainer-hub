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
});
