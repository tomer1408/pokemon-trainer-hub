import { Component, inject, signal } from '@angular/core';
import { AdminSystemService, SystemHealth } from '../../../core/admin-system';
import { ADMIN_EXTERNAL_LINKS } from '../../../shared/admin-external-links';

// Phase 4: one GET /api/admin/system call — real DB + PokeAPI checks (with
// real latency), Gemini/Sentry reported honestly as configured/not_configured
// (never a fabricated "Operational", since neither is actually called on
// every page load), and real runtime/build info. 4 visually separate
// sections per the mockup: Runtime, Errors & Issues, Build & Deployment,
// External Dependencies.
@Component({
  selector: 'app-admin-system',
  imports: [],
  templateUrl: './system.html',
  styleUrl: './system.css',
})
export class AdminSystem {
  private readonly adminSystemService = inject(AdminSystemService);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly health = signal<SystemHealth | null>(null);
  protected readonly externalLinks = ADMIN_EXTERNAL_LINKS;

  constructor() {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.adminSystemService.getSystemHealth().subscribe({
      next: (h) => {
        this.health.set(h);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  }
}
