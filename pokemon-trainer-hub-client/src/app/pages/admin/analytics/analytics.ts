import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';
import { Analytics, AdminAnalyticsService } from '../../../core/admin-analytics';
import { DonutChart, DonutSegment } from '../../../shared/donut-chart/donut-chart';
import { HBarList } from '../../../shared/hbar-list/hbar-list';
import { MiniBarChart } from '../../../shared/mini-bar-chart/mini-bar-chart';
import { ThemeService } from '../../../shared/theme';

const DAY_OPTIONS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '180D', days: 180 },
];

interface FunnelRow {
  step: string;
  count: number;
  pct: number;
  dropFromPrevious: number | null;
}

// Phase 5: one GET /api/admin/analytics?days=N call — real over-time
// buckets, a real sequential funnel, real popularity/battle/support
// distributions, and real Who's That streak stats. Charts are small,
// hand-rolled components (HBarList/MiniBarChart/DonutChart) — no new
// charting library. Deliberately omits DAU/MAU/retention/last-login/
// page-views — this app has no data source for any of them, and this
// project's standing rule is to never fake a metric.
@Component({
  selector: 'app-admin-analytics',
  imports: [DonutChart, HBarList, MiniBarChart],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class AdminAnalytics {
  private readonly adminAnalyticsService = inject(AdminAnalyticsService);
  protected readonly theme = inject(ThemeService);

  protected readonly dayOptions = DAY_OPTIONS;
  protected readonly daysFilter = signal(30);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly analytics = toSignal(
    toObservable(this.daysFilter).pipe(
      tap(() => {
        this.isLoading.set(true);
        this.loadError.set(false);
      }),
      switchMap((days) =>
        this.adminAnalyticsService.getAnalytics(days).pipe(
          catchError(() => {
            this.loadError.set(true);
            return of(null);
          }),
        ),
      ),
      tap(() => this.isLoading.set(false)),
    ),
    { initialValue: null as Analytics | null },
  );

  protected readonly funnelRows = computed<FunnelRow[]>(() => {
    const funnel = this.analytics()?.funnel ?? [];
    const first = funnel[0]?.count ?? 0;
    return funnel.map((step, i) => ({
      step: step.step,
      count: step.count,
      pct: first > 0 ? Math.round((step.count / first) * 100) : 0,
      dropFromPrevious: i === 0 ? null : funnel[i - 1].count - step.count,
    }));
  });

  protected readonly popularInTeamsItems = computed(() =>
    (this.analytics()?.popularPokemon.inTeams ?? []).map((p) => ({ label: p.pokemonName, count: p.count })),
  );

  protected readonly popularFavoritedItems = computed(() =>
    (this.analytics()?.popularPokemon.favorited ?? []).map((p) => ({ label: p.pokemonName, count: p.count })),
  );

  protected readonly resultSegments = computed<DonutSegment[]>(() => {
    const results = this.analytics()?.battleStats.results ?? [];
    const colorFor = (label: string) => (label === 'win' ? 'var(--success)' : label === 'loss' ? 'var(--danger)' : 'var(--text-secondary-night)');
    return results.map((r) => ({ label: r.label, count: r.count, colorVar: colorFor(r.label) }));
  });

  setDays(days: number): void {
    this.daysFilter.set(days);
  }
}
