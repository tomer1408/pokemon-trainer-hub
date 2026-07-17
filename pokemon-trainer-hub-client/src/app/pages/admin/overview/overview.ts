import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../../../core/admin';

// Phase 0: a minimal verification page only — calls the real
// GET /api/admin/ping endpoint and shows the real result, proving the whole
// chain (adminGuard -> real access token -> requirePermission -> 200) works
// end to end. Phase 3 replaces this component's contents with the real
// Admin Overview (KPIs, system summary, recent activity) at this same
// `/admin` route — no route/guard changes needed when that happens. Now
// rendered inside AdminLayout (Phase 1), which already provides the page
// title/theme chrome — this component only owns its own content.
@Component({
  selector: 'app-admin-overview',
  imports: [],
  templateUrl: './overview.html',
  styleUrl: './overview.css',
})
export class AdminOverview {
  private readonly admin = inject(AdminService);

  protected readonly checking = signal(true);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.admin.ping().subscribe({
      next: (result) => {
        this.message.set(result.message);
        this.checking.set(false);
      },
      error: () => {
        this.error.set('Could not reach the Admin API.');
        this.checking.set(false);
      },
    });
  }
}
