import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { from } from 'rxjs';
import { AuthService, Auth0ClientService, AuthState } from '@auth0/auth0-angular';
import { ProfileService } from '../../core/profile';
import { ThemeService } from '../../shared/theme';

type CallbackState = 'checking' | 'error-auth' | 'error-profile';

// provideAuth0() has skipRedirectCallback: true (see app.config.ts) specifically so
// this page — not the SDK's own default post-login navigation — is the sole owner
// of "where does the user go after login". The decision is based on whether a real
// TrainerProfile row exists in our DB, not on Auth0's appState.
//
// We deliberately do NOT call AuthService.handleRedirectCallback() — its own
// implementation (see @auth0/auth0-angular's fesm2022 bundle) unconditionally runs
// `this.navigator.navigateByUrl(appState?.target ?? '/')` as a side effect before our
// code even sees the result. Since login is triggered with no appState.target, that
// races our own home-vs-onboarding navigation below and intermittently strands the
// user back on Landing. Calling the raw Auth0Client directly does the same code
// exchange without that built-in navigation; AuthState.refresh() then updates
// isAuthenticated$/user$ the same way the wrapper would have.
@Component({
  selector: 'app-callback',
  templateUrl: './callback.html',
  styleUrl: './callback.css',
})
export class Callback {
  private readonly auth = inject(AuthService);
  private readonly auth0Client = inject(Auth0ClientService);
  private readonly authState = inject(AuthState);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly state = signal<CallbackState>('checking');

  constructor() {
    this.exchangeCode();
  }

  private exchangeCode(): void {
    this.state.set('checking');
    from(this.auth0Client.handleRedirectCallback()).subscribe({
      next: () => {
        this.authState.refresh();
        this.checkProfile();
      },
      error: () => this.state.set('error-auth'),
    });
  }

  private checkProfile(): void {
    this.state.set('checking');
    this.profileService.getProfileStrict().subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: (err) => {
        if (err?.status === 404) {
          this.router.navigateByUrl('/onboarding');
        } else if (err?.status === 401 || err?.status === 403) {
          // A bad/expired token can't be fixed by repeating the same GET —
          // route it through the same retry path as a failed code exchange
          // (fresh loginWithRedirect()) instead of the generic profile error.
          this.state.set('error-auth');
        } else {
          this.state.set('error-profile');
        }
      },
    });
  }

  retry(): void {
    // A failed code exchange can't be replayed (the code is single-use), so
    // "try again" there means restarting the whole login round-trip. A failed
    // profile check is just a plain GET — safe to repeat as-is.
    if (this.state() === 'error-auth') {
      this.auth.loginWithRedirect().subscribe();
    } else {
      this.checkProfile();
    }
  }
}
