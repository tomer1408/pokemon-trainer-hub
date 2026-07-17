// Development config (used by `ng serve` and plain `ng build`) — points at
// the local Express server. `environment.production.ts` overrides this via
// angular.json's fileReplacements for the `production` build configuration.
export const environment = {
  production: false,
  apiBase: 'http://localhost:3000/api',
  // A client-side Sentry DSN is meant to be public (same trust level as the
  // Auth0 domain/clientId already hardcoded in app.config.ts) — empty until
  // a real Sentry project exists, at which point @sentry/angular just no-ops.
  sentryDsn: '',
};
