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
    // Logged server-side only, and only the error's generic type (e.g.
    // "PrismaClientKnownRequestError") — never its message, which could
    // otherwise echo back connection details.
    console.error('Health check: database connectivity failed —', err?.name || 'UnknownError');
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
