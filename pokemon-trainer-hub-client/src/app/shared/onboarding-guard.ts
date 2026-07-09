import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ProfileService } from '../core/profile';

// /onboarding is only for trainers who haven't created a profile yet.
// authGuardFn (on the route already) only checks "is logged in" — this
// checks the actual condition: does a real TrainerProfile row exist for
// this user? If it does, they're redirected to the Dashboard instead of
// being able to revisit the one-time setup form just by typing the URL.
export const onboardingGuard: CanActivateFn = () => {
  const profileService = inject(ProfileService);
  const router = inject(Router);

  return profileService.getProfileStrict().pipe(
    map(() => router.parseUrl('/dashboard')),
    // 404 = genuinely no profile yet, the only case onboarding should be
    // reachable. Any other error fails open (allow access) rather than
    // stranding a real new user behind a transient network/server hiccup.
    catchError(() => of(true)),
  );
};
