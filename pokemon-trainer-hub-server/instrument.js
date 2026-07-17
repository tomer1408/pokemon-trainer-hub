// Sentry's own required pattern: this file must be required before
// anything else in server.js, so its instrumentation can patch Node's
// module loader before those modules are loaded. dotenv is loaded here too
// (not just in server.js) since Sentry.init needs SENTRY_DSN to already be
// on process.env at this point — Render sets env vars directly, but local
// dev needs the .env file read first.
require('dotenv').config({ quiet: true });
const Sentry = require('@sentry/node');

// With SENTRY_DSN unset (local dev, CI, or before a real DSN is configured),
// the SDK no-ops safely by design — no conditional guard needed here or
// anywhere else in the app.
Sentry.init({ dsn: process.env.SENTRY_DSN });
