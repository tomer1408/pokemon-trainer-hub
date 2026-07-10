import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAuth0, AuthHttpInterceptor } from '@auth0/auth0-angular';

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
        allowedList: [`${apiOrigin}/*`],
      },
      // CallbackPage owns the post-login redirect decision (home vs.
      // onboarding, based on real profile data) — without this, the SDK would
      // auto-navigate to '/' right after the code exchange, racing our own logic.
      skipRedirectCallback: true,
    }),
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true }
  ]
};
