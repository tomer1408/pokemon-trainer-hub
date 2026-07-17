import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AdminService } from '../core/admin';

// Generic — NOT hardcoded to a single permission. Reads which permission the
// destination route requires from that route's own `data.permission` (see
// app.routes.ts), so every future /admin/** route reuses this exact guard
// just by declaring its own required permission — no new guard code per
// resource, and no risk of a future limited-scope Admin role (e.g.
// support-only) being incorrectly blocked by a guard that only ever checked
// one hardcoded permission.
//
// Waits for AdminService.permissions$'s real async resolution (not the
// signal, which could still be its initial empty-array value the instant
// this guard runs) before deciding — same reasoning as onboardingGuard's
// Observable<boolean | UrlTree> shape.
//
// Unauthenticated visitors never reach this guard's logic at all — authGuardFn
// runs first in every /admin/** route's canActivate array and handles that
// case with the normal Auth0 login redirect. This guard only ever has to
// decide "authenticated, but does this permission exist on their token?" —
// and on "no," it redirects to /admin/access-denied, never /home, and never
// silently.
export const adminGuard: CanActivateFn = (route) => {
  const admin = inject(AdminService);
  const router = inject(Router);

  const requiredPermission = route.data['permission'] as string | undefined;

  return admin.permissions$.pipe(
    take(1),
    map((permissions) =>
      requiredPermission && permissions.includes(requiredPermission)
        ? true
        : router.parseUrl('/admin/access-denied'),
    ),
  );
};
