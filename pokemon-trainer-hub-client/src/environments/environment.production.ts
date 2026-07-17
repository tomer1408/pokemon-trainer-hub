// Production config — used when building with `ng build` (its
// `production` configuration is the default). Replaces environment.ts via
// angular.json's fileReplacements.
export const environment = {
  production: true,
  apiBase: 'https://pokemon-trainer-hub-server.onrender.com/api',
  // A client-side Sentry DSN is meant to be public (same trust level as the
  // Auth0 domain/clientId already hardcoded in app.config.ts) — empty until
  // a real Sentry project exists, at which point @sentry/angular just no-ops.
  sentryDsn: '',
};
