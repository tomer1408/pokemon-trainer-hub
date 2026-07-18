import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ProfileService } from '../core/profile';

// /onboarding is only for trainers who haven't created a profile yet.
// authGuardFn (on the route already) only checks "is logged in" — this
// checks the actual condition: does a real TrainerProfile row exist for
// this user? If it does, they're redirected to Home instead of
// being able to revisit the one-time setup form just by typing the URL.
export const onboardingGuard: CanActivateFn = () => {
  const profileService = inject(ProfileService);
  const router = inject(Router);

  // Callback just ran this exact same GET /api/profile check moments ago
  // (that's the only real way to land here right after signup) and already
  // confirmed there's no profile — trust that instead of firing the
  // identical request again back-to-back. Anyone reaching /onboarding any
  // other way (e.g. typing the URL directly) has no such state, so they
  // still get the real check below.
  if (router.getCurrentNavigation()?.extras.state?.['profileConfirmedMissing']) {
    return true;
  }

  return profileService.getProfileStrict().pipe(
    map(() => router.parseUrl('/home')),
    catchError((err) => {
      // A soft-deleted trainer with a stale token could otherwise reach
      // /onboarding directly and, without this check, resurrect/overwrite
      // their soft-deleted row via a normal profile save (see
      // routes/profile.js's POST / guard). Routed to the same restoration
      // entry point as callback.ts's ACCOUNT_DELETED case.
      if (err?.status === 403 && err?.error?.code === 'ACCOUNT_DELETED') {
        return of(router.parseUrl('/restore-account'));
      }
      // 404 = genuinely no profile yet, the only other case onboarding
      // should be reachable. Any other error fails open (allow access)
      // rather than stranding a real new user behind a transient
      // network/server hiccup.
      return of(true);
    }),
  );
};
