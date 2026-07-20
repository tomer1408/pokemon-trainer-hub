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

// Raw eventType -> a human label, for the Feature Adoption HBarList.
const FEATURE_ADOPTION_LABELS: Record<string, string> = {
  onboarding_completed: 'Onboarding Completed',
  starter_quiz_completed: 'Starter Quiz Completed',
  pokemon_added_to_team: 'Pokémon Added to Team',
  dream_team_completed: 'Dream Team Completed (5/5)',
  battle_completed: 'Battle Completed',
  whos_that_round_completed: "Who's That Round Played",
  support_request_created: 'Support Request Sent',
  ai_request_completed: 'AI Request Completed',
};

// Phase 5 (Admin Dashboard) + Phase 8 (Product Analytics Tracking, once
// approved and built): one GET /api/admin/analytics?days=N call — real
// over-time buckets, a real sequential funnel, real popularity/battle/
// support distributions, real Who's That streak stats, and now real DAU/
// MAU/retention/page-view/session/feature-adoption/AI-success-rate numbers
// too, computed server-side from the real AppEvent table (see
// services/adminAnalyticsService.js). Those numbers are only meaningful
// from the moment Phase 8 actually deployed onward — never backfilled or
// estimated for older activity, per this project's standing rule to never
// fake a metric. Charts are small, hand-rolled components (HBarList/
// MiniBarChart/DonutChart) — no new charting library.
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

  protected readonly featureAdoptionItems = computed(() =>
    (this.analytics()?.engagement.featureAdoption ?? []).map((f) => ({
      label: FEATURE_ADOPTION_LABELS[f.label] ?? f.label,
      count: f.count,
    })),
  );

  setDays(days: number): void {
    this.daysFilter.set(days);
  }
}
