import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { HttpErrorResponse } from '@angular/common/http';
import { ProfileService } from '../../core/profile';
import { ThemeService } from '../../shared/theme';

type RestoreAccountState = 'checking' | 'blocked' | 'submitted' | 'error';
type DeletionType = 'self' | 'admin';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Reached by a soft-deleted trainer logging back in during their 30-day
// window (pages/callback/callback.ts and shared/onboarding-guard.ts both
// route here on a 403 ACCOUNT_DELETED from GET /api/profile). Guarded by
// authGuardFn ONLY (see app.routes.ts) — deliberately not a second check
// of its own, so this can never itself loop.
//
// Deliberately re-checks GET /api/profile itself on init rather than
// trusting router navigation state — works correctly on a direct
// navigation or a page refresh, not just immediately after callback.ts.
@Component({
  selector: 'app-restore-account',
  imports: [],
  templateUrl: './restore-account.html',
  styleUrl: './restore-account.css',
})
export class RestoreAccount {
  private readonly profileService = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly state = signal<RestoreAccountState>('checking');
  protected readonly deletionType = signal<DeletionType | null>(null);
  protected readonly purgeAt = signal<string | null>(null);

  protected readonly messageInput = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  // Real days-remaining, computed fresh from the server's own purgeAt —
  // never a client-guessed "30 days from whenever this loaded".
  protected readonly daysRemaining = computed(() => {
    const purge = this.purgeAt();
    if (!purge) return null;
    const ms = new Date(purge).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / MS_PER_DAY));
  });

  protected readonly isSelfDeleted = computed(() => this.deletionType() === 'self');

  constructor() {
    this.checkStatus();
  }

  private checkStatus(): void {
    this.state.set('checking');
    this.profileService.getProfileStrict().subscribe({
      next: () => {
        // The account isn't actually deleted (already restored, or never
        // was) — nothing for this page to do.
        this.router.navigateByUrl('/home');
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 403 && err.error?.code === 'ACCOUNT_DELETED') {
          this.deletionType.set(err.error.deletionType ?? null);
          this.purgeAt.set(err.error.purgeAt ?? null);
          this.state.set('blocked');
        } else {
          this.state.set('error');
        }
      },
    });
  }

  retry(): void {
    this.checkStatus();
  }

  submitRequest(): void {
    if (this.submitting()) return;
    const message = this.messageInput().trim();
    if (!message) {
      this.submitError.set('Please enter a message.');
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.profileService.requestRestoration(message).subscribe({
      next: () => {
        this.submitting.set(false);
        this.state.set('submitted');
      },
      error: () => {
        this.submitting.set(false);
        this.submitError.set('Something went wrong sending your request. Please try again.');
      },
    });
  }

  logOut(): void {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }
}
