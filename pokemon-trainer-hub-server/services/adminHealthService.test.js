const { describe, test, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/adminHealthService', () => {
  let service;
  let prisma;
  let originalFetch;
  let originalEnv;

  before(() => {
    prisma = { $queryRaw: mock.fn(async () => [{ 1: 1 }]) };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    service = require('./adminHealthService');
  });

  beforeEach(() => {
    prisma.$queryRaw.mock.resetCalls();
    prisma.$queryRaw.mock.mockImplementation(async () => [{ 1: 1 }]);
    originalFetch = global.fetch;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  describe('getSystemHealth', () => {
    test('reports the database as operational with a real latency when the query succeeds', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));

      const health = await service.getSystemHealth();

      const db = health.dependencies.find((d) => d.name === 'Database');
      assert.equal(db.status, 'operational');
      assert.equal(typeof db.latencyMs, 'number');
    });

    test('reports the database as down when the query throws, never crashing the whole response', async () => {
      prisma.$queryRaw.mock.mockImplementationOnce(async () => {
        throw new Error('connection refused');
      });
      global.fetch = mock.fn(async () => ({ ok: true }));

      const health = await service.getSystemHealth();

      const db = health.dependencies.find((d) => d.name === 'Database');
      assert.equal(db.status, 'down');
    });

    test('reports PokeAPI as operational on a real successful fetch', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));

      const health = await service.getSystemHealth();

      const pokeapi = health.dependencies.find((d) => d.name === 'PokeAPI');
      assert.equal(pokeapi.status, 'operational');
      assert.equal(global.fetch.mock.calls.length, 1);
    });

    test('reports PokeAPI as down when the fetch fails, never crashing the whole response', async () => {
      global.fetch = mock.fn(async () => ({ ok: false, status: 503 }));

      const health = await service.getSystemHealth();

      const pokeapi = health.dependencies.find((d) => d.name === 'PokeAPI');
      assert.equal(pokeapi.status, 'down');
    });

    test('reports Gemini as configured/not_configured from real env var presence, never "operational"', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));
      process.env.GOOGLE_API_KEY = 'a-real-key';

      const withKey = await service.getSystemHealth();
      const gemini1 = withKey.dependencies.find((d) => d.name === 'Gemini (AI Assistant)');
      assert.equal(gemini1.status, 'configured');

      delete process.env.GOOGLE_API_KEY;
      const withoutKey = await service.getSystemHealth();
      const gemini2 = withoutKey.dependencies.find((d) => d.name === 'Gemini (AI Assistant)');
      assert.equal(gemini2.status, 'not_configured');
    });

    test('reports Sentry status from real env var presence, with no fabricated error count', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));
      process.env.SENTRY_DSN = 'https://example.sentry.io/1';

      const health = await service.getSystemHealth();

      assert.equal(health.errors.sentryStatus, 'configured');
      assert.equal('errorCount' in health.errors, false);
    });

    test('surfaces real process.version and NODE_ENV', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));
      process.env.NODE_ENV = 'test';

      const health = await service.getSystemHealth();

      assert.equal(health.runtime.nodeVersion, process.version);
      assert.equal(health.runtime.nodeEnv, 'test');
      assert.equal(typeof health.runtime.uptimeSeconds, 'number');
    });

    test('surfaces a real latest migration folder name via fs.readdirSync, not a hardcoded value', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));

      const health = await service.getSystemHealth();

      assert.match(health.build.latestMigration, /^\d{14}_/);
    });

    test('falls back to "unknown" for gitCommit when RENDER_GIT_COMMIT is absent', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));
      delete process.env.RENDER_GIT_COMMIT;

      const health = await service.getSystemHealth();

      assert.equal(health.build.gitCommit, 'unknown');
    });

    test('surfaces the real gitCommit when RENDER_GIT_COMMIT is present', async () => {
      global.fetch = mock.fn(async () => ({ ok: true }));
      process.env.RENDER_GIT_COMMIT = 'abc1234';

      const health = await service.getSystemHealth();

      assert.equal(health.build.gitCommit, 'abc1234');
    });
  });
});
