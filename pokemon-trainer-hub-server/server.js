require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');

const jwtCheck = require('./middleware/auth');
const prisma = require('./services/prisma');
const pokemonRouter = require('./routes/pokemon');
const teamRouter = require('./routes/team');
const profileRouter = require('./routes/profile');
const favoritesRouter = require('./routes/favorites');
const notesRouter = require('./routes/notes');

const app = express();
// Render (and most hosts) assign the port via this env var — 3000 stays as
// the local-dev fallback.
const PORT = process.env.PORT || 3000;

// TEMPORARY startup diagnostic — logs only which DB *target* this process
// actually resolved DATABASE_URL to (host:port + database name), never the
// credentials. This is what's letting us tell "DATABASE_URL isn't reaching
// this process at all" apart from "it's set, but to the wrong value" or "a
// real network/firewall/auth problem downstream." Remove once the Render ->
// Azure SQL connection issue is resolved.
function safeDbTarget(url) {
  if (!url) return { hasDatabaseUrl: false };
  const host = url.replace(/^sqlserver:\/\//i, '').split(';')[0];
  const databaseMatch = url.match(/database=([^;]+)/i);
  return {
    hasDatabaseUrl: true,
    host,
    database: databaseMatch ? databaseMatch[1] : undefined,
  };
}
console.log('DB config target:', safeDbTarget(process.env.DATABASE_URL));

// CORS_ORIGIN lets production restrict this to the real deployed client URL
// (e.g. https://pokemon-trainer-hub.vercel.app) via an env var instead of
// hardcoding it — falls back to allowing any origin for local dev, where
// there's no real security boundary to protect anyway.
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : undefined));
app.use(express.json());

// Test route — just to confirm the server is alive. Deliberately does NOT
// touch the database — that's what /api/health/db below is for.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Pokemon Trainer Hub API is running!' });
});

// Deployment readiness check — confirms this server can actually reach the
// database (e.g. Render -> Azure SQL over the network/firewall), not just
// that the Node process is up. No auth required (it's an infra check, not a
// user-data endpoint), and deliberately returns nothing beyond ok/error:
// no row data, no counts, no Prisma error details, no connection info.
app.get('/api/health/db', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    // TEMPORARY diagnostic logging while troubleshooting the Render -> Azure
    // SQL connection — server-side only (never sent to the client), and
    // limited to a few safe fields: the error's class name, its driver/Prisma
    // error code, and a truncated slice of its message. None of these are
    // expected to contain DATABASE_URL, the password, or any token — driver
    // connection errors describe *what* failed (timeout, auth, TLS), not the
    // credentials used. Remove this once the connection issue is resolved.
    console.error('DB health check failed', {
      name: err?.name,
      code: err?.code,
      message: String(err?.message || '').slice(0, 300),
      // Folded in here (not just at startup) so it's guaranteed to show up
      // right alongside the error in whatever log window is visible, instead
      // of requiring a separate scroll back to the boot-time line.
      dbTarget: safeDbTarget(process.env.DATABASE_URL),
    });
    res.status(503).json({ status: 'error', db: 'error' });
  }
});

// Day 1 smoke-test route — proves a valid Auth0 access token is accepted
app.get('/api/private', jwtCheck, (req, res) => {
  res.json({ message: 'Token verified — you are authenticated!' });
});

app.use('/api/pokemon', pokemonRouter);
app.use('/api/team', teamRouter);
app.use('/api/profile', profileRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/notes', notesRouter);

// Catches every error from the routes above (including auth failures) and
// always responds with clean JSON instead of Express's default HTML+stack-trace page.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: status === 500 ? 'Something went wrong on our end.' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
