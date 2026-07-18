import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { decodeJwtPayload } from '../shared/jwt-decode';

// Real Auth0 `permissions` (RBAC claim) for the current user — a UX
// convenience only. The server's requirePermission middleware is the real,
// only trusted gate; nothing here is ever assumed to be secure on its own.
// Fails closed to an empty array (never grants access, never throws/crashes
// navigation) in every failure mode: auth state still loading, not
// authenticated, getAccessTokenSilently() rejecting, a missing/malformed
// `permissions` claim, or an undecodable token.
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly auth = inject(AuthService);

  // Exposed as an Observable (not just the signal below) so adminGuard can
  // wait for the real async resolution — auth-loading state settling, the
  // token actually being fetched and decoded — before deciding, instead of
  // reading a signal that might still be its initial `[]` value if the
  // guard happened to run before that async chain finished.
  readonly permissions$ = this.auth.isLoading$.pipe(
    filter((isLoading) => !isLoading),
    switchMap(() => this.auth.isAuthenticated$),
    switchMap((isAuthenticated) => {
      if (!isAuthenticated) return of([] as string[]);

      return this.auth.getAccessTokenSilently().pipe(
        map((token) => {
          const payload = decodeJwtPayload(token);
          const claim = payload?.['permissions'];
          return Array.isArray(claim) ? (claim as string[]) : [];
        }),
        catchError(() => of([] as string[])),
      );
    }),
  );

  // Signal form — for reactive template use (e.g. conditionally showing the
  // Admin nav link), where an eventually-consistent value is fine.
  readonly permissions = toSignal(this.permissions$, { initialValue: [] as string[] });

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }
}
