import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { HealthCheckResult, HealthService } from '../../core/health';
import { ThemeService } from '../../shared/theme';

const AUTO_POLL_MS = 30_000;

// Public, unauthenticated status page (see app.routes.ts) — wraps the two
// already-real, already-deployed health endpoints in core/health.ts.
// Deliberately public: the endpoints it calls are public by design, and a
// status page needs to be checkable precisely when something might be
// broken, including a broken login itself.
@Component({
  selector: 'app-status',
  imports: [],
  templateUrl: './status.html',
  styleUrl: './status.css',
})
export class Status {
  private readonly health = inject(HealthService);
  protected readonly theme = inject(ThemeService);

  protected readonly apiStatus = signal<HealthCheckResult | null>(null);
  protected readonly dbStatus = signal<HealthCheckResult | null>(null);
  protected readonly lastChecked = signal<Date | null>(null);
  protected readonly checking = signal(false);

  // Real, derived overall state — never hardcoded. Absent (null) checks
  // count as "not down" so the banner doesn't flash red before the very
  // first check has come back.
  protected readonly allUp = computed(() => {
    const api = this.apiStatus();
    const db = this.dbStatus();
    return (api?.up ?? true) && (db?.up ?? true);
  });

  constructor() {
    this.checkNow();

    const intervalId = setInterval(() => this.checkNow(), AUTO_POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalId));
  }

  checkNow(): void {
    this.checking.set(true);
    forkJoin([this.health.checkApi(), this.health.checkDb()]).subscribe(([api, db]) => {
      this.apiStatus.set(api);
      this.dbStatus.set(db);
      this.lastChecked.set(new Date());
      this.checking.set(false);
    });
  }
}
