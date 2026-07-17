import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../../../shared/theme';

// Reached when an authenticated trainer without the required permission
// hits an /admin/** route — adminGuard redirects here instead of /home, so
// the denial is legible instead of a confusing silent bounce. Guarded by
// authGuardFn ONLY (see app.routes.ts) — deliberately not adminGuard, so
// landing here can never itself trigger another redirect loop.
@Component({
  selector: 'app-admin-access-denied',
  imports: [RouterLink],
  templateUrl: './access-denied.html',
  styleUrl: './access-denied.css',
})
export class AdminAccessDenied {
  protected readonly theme = inject(ThemeService);
}
