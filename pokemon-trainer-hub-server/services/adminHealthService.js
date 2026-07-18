const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');
const packageJson = require('../package.json');

const POKEAPI_PING_URL = 'https://pokeapi.co/api/v2/pokemon/1';
const EXTERNAL_PING_TIMEOUT_MS = 5000;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

async function timed(fn) {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// The same in-process DB check server.js already exposes at /api/health/db —
// reused here, not re-implemented, just with latency measured too.
async function checkDatabase() {
  const { ok, latencyMs } = await timed(() => prisma.$queryRaw`SELECT 1`);
  return { name: 'Database', status: ok ? 'operational' : 'down', latencyMs };
}

// A real, cheap PokeAPI request — not a fabricated "Operational" — aborted
// after EXTERNAL_PING_TIMEOUT_MS so a slow/hanging upstream can't stall this
// page.
async function checkPokeApi() {
  const { ok, latencyMs } = await timed(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_PING_TIMEOUT_MS);
    try {
      const response = await fetch(POKEAPI_PING_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`PokeAPI responded with ${response.status}`);
    } finally {
      clearTimeout(timeout);
    }
  });
  return { name: 'PokeAPI', status: ok ? 'operational' : 'down', latencyMs };
}

// Gemini has no cheap, side-effect-free "are you alive" call worth making on
// every page load (it's a paid API) — reporting real env-var presence as
// "configured"/"not_configured" is honest; claiming "Operational" would not
// be, since it was never actually called.
function checkGeminiConfigured() {
  return { name: 'Gemini (AI Assistant)', status: process.env.GOOGLE_API_KEY ? 'configured' : 'not_configured' };
}

function getSentryStatus() {
  return process.env.SENTRY_DSN ? 'configured' : 'not_configured';
}

// Real migration folder names, sorted — Prisma's own timestamp-prefixed
// naming convention means the last one alphabetically is also the latest
// chronologically. Falls back to 'unknown' rather than throwing if the
// migrations directory is ever missing (e.g. a stripped-down deploy image).
function getLatestMigration() {
  try {
    const entries = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    return entries.length > 0 ? entries[entries.length - 1] : 'none';
  } catch {
    return 'unknown';
  }
}

async function getSystemHealth() {
  const [database, pokeapi] = await Promise.all([checkDatabase(), checkPokeApi()]);

  return {
    runtime: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    },
    dependencies: [database, pokeapi, checkGeminiConfigured()],
    errors: {
      // No in-app error aggregation exists (and none is added here) — real
      // error data lives exclusively in the linked external Sentry
      // dashboard. This is only ever "configured"/"not_configured", never a
      // fabricated error count.
      sentryStatus: getSentryStatus(),
    },
    build: {
      appVersion: packageJson.version,
      latestMigration: getLatestMigration(),
      gitCommit: process.env.RENDER_GIT_COMMIT || 'unknown',
    },
  };
}

module.exports = { getSystemHealth };
