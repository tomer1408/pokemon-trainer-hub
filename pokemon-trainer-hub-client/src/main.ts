import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// With environment.sentryDsn unset (local dev, until a real DSN is
// configured), the SDK no-ops safely by design — no conditional guard
// needed here or anywhere else in the app.
Sentry.init({
  dsn: environment.sentryDsn,
  environment: environment.production ? 'production' : 'development',
});

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
