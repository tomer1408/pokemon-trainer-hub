import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAuth0, AuthHttpInterceptor } from '@auth0/auth0-angular';
import * as Sentry from '@sentry/angular';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

// Derived from the same environment.apiBase used everywhere else (never a
// second hardcoded host) — this is what tells the Auth0 SDK's interceptor
// which requests should get a Bearer token attached. If this doesn't match
// the real deployed API's origin, every API call silently goes out with no
// token and every protected route 401s.
const apiOrigin = new URL(environment.apiBase).origin;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideAuth0({
      domain: 'dev-4sn27sue6rmxl7hd.us.auth0.com',
      clientId: 'm2CW5aCuTqDWg3hYETtWlZ56FSFOIJ1d',
      authorizationParams: {
        redirect_uri: `${window.location.origin}/callback`,
        audience: 'https://pokemon-trainer-hub-api',
      },
      httpInterceptor: {
        // The two health-check endpoints back the public /status page (see
        // app.routes.ts) and must work for a logged-out visitor. Listed
        // FIRST — findMatchingRoute (the SDK's own interceptor) takes the
        // first allowedList entry that matches a request, and the general
        // wildcard below would otherwise match /health too and fail the
        // request outright (no anonymous fallback) when there's no active
        // Auth0 session. allowAnonymous lets it through with no token
        // instead — the server's own jwtCheck never guards these routes.
        allowedList: [
          { uri: `${environment.apiBase}/health*`, allowAnonymous: true },
          `${apiOrigin}/*`,
        ],
      },
      // CallbackPage owns the post-login redirect decision (home vs.
      // onboarding, based on real profile data) — without this, the SDK would
      // auto-navigate to '/' right after the code exchange, racing our own logic.
      skipRedirectCallback: true,
    }),
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
    // No ErrorHandler was registered before this — provideBrowserGlobalErrorListeners()
    // above is Angular's own trigger for window/unhandledrejection errors
    // reaching whichever ErrorHandler is registered, so this composes cleanly.
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: false }) },
  ]
};
