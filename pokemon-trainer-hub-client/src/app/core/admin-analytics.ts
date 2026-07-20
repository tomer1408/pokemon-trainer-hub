import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export interface DailyCount {
  date: string;
  count: number;
}

export interface FunnelStep {
  step: string;
  count: number;
}

export interface PopularEntry {
  pokemonId: number;
  pokemonName: string;
  count: number;
}

export interface LabeledCount {
  label: string;
  count: number;
}

export interface AiFeatureStats {
  feature: string;
  completed: number;
  failed: number;
  successRatePct: number | null;
}

export interface RetentionWindow {
  eligible: number;
  retained: number;
  ratePct: number | null;
}

export interface Analytics {
  days: number;
  overTime: {
    profiles: DailyCount[];
    battles: DailyCount[];
  };
  funnel: FunnelStep[];
  popularPokemon: {
    inTeams: PopularEntry[];
    favorited: PopularEntry[];
  };
  battleStats: {
    results: LabeledCount[];
    byDifficulty: LabeledCount[];
    byOpponentType: LabeledCount[];
  };
  whosThatStats: {
    averageBestStreak: number;
    highestBestStreak: number;
    trainersWhoHavePlayed: number;
  };
  supportStats: {
    byTopic: LabeledCount[];
    byStatus: LabeledCount[];
  };
  // Phase 8 — real, computed from the AppEvent table (see
  // services/adminAnalyticsService.js's computeEngagementStats/
  // computeRetention). Only meaningful from the moment that phase
  // deployed onward — never backfilled or estimated for older activity.
  engagement: {
    dau: number;
    mau: number;
    pageViewsOverTime: DailyCount[];
    sessionsOverTime: DailyCount[];
    featureAdoption: LabeledCount[];
    aiRequestStats: AiFeatureStats[];
  };
  retention: {
    day1: RetentionWindow;
    day7: RetentionWindow;
    day30: RetentionWindow;
  };
}

@Injectable({ providedIn: 'root' })
export class AdminAnalyticsService {
  private readonly http = inject(HttpClient);

  getAnalytics(days?: number): Observable<Analytics> {
    let params = new HttpParams();
    if (days !== undefined) params = params.set('days', String(days));
    return this.http.get<Analytics>(`${API_BASE}/admin/analytics`, { params });
  }
}
