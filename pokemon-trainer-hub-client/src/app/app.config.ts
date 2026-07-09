import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAuth0, AuthHttpInterceptor } from '@auth0/auth0-angular';

import { routes } from './app.routes';

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
        allowedList: ['http://localhost:3000/*'],
      },
      // CallbackPage owns the post-login redirect decision (dashboard vs.
      // onboarding, based on real profile data) — without this, the SDK would
      // auto-navigate to '/' right after the code exchange, racing our own logic.
      skipRedirectCallback: true,
    }),
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true }
  ]
};
