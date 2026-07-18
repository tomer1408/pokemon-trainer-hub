import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';
import { AgeRange } from '../shared/age-range';

export interface TrainerListItem {
  auth0UserId: string;
  trainerName: string;
  country: string;
  ageRange: AgeRange | null;
  favoriteType: string;
  hasCompletedStarterQuiz: boolean;
  createdAt: string;
  teamSize: number;
  favoritesCount: number;
  battleCount: number;
}

export interface TrainerListFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  country?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface TrainerListResult {
  results: TrainerListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TrainerDetailProfile {
  auth0UserId: string;
  trainerName: string;
  country: string;
  ageRange: AgeRange | null;
  favoriteType: string;
  experienceLevel: string;
  teamName: string | null;
  marketingEmailsOptIn: boolean;
  acceptedPolicy: boolean;
  acceptedPolicyAt: string | null;
  policyVersion: string | null;
  hasCompletedStarterQuiz: boolean;
  whosThatBestStreak: number;
  createdAt: string;
}

export interface TrainerTeamMember {
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string;
  types: string[];
  baseExperience: number;
}

export interface TrainerBattleSummary {
  id: number;
  opponentName: string;
  difficulty: string;
  result: 'win' | 'loss';
  yourWins: number;
  oppWins: number;
  createdAt: string;
}

export interface TrainerSupportRequestSummary {
  id: number;
  topic: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface TrainerDetail {
  profile: TrainerDetailProfile;
  team: TrainerTeamMember[];
  favoritesCount: number;
  battles: {
    total: number;
    wins: number;
    losses: number;
    difficultyBreakdown: Record<string, number>;
    recent: TrainerBattleSummary[];
  };
  supportRequests: TrainerSupportRequestSummary[];
}

// A partial view of Auth0's real user object — only the fields the Trainer
// detail page actually shows, but the server passes through whatever Auth0
// itself returns for those fields (never invented).
export interface Auth0UserInfo {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  last_login?: string;
  logins_count?: number;
}

export interface DeleteTrainerResult {
  message: string;
  warning?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminTrainersService {
  private readonly http = inject(HttpClient);

  list(filters: TrainerListFilters = {}): Observable<TrainerListResult> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<TrainerListResult>(`${API_BASE}/admin/trainers`, { params });
  }

  getDetail(auth0UserId: string): Observable<TrainerDetail> {
    return this.http.get<TrainerDetail>(`${API_BASE}/admin/trainers/${encodeURIComponent(auth0UserId)}`);
  }

  // A genuine read (correctly a GET) — refreshes Auth0 profile info for one
  // trainer on demand, never persisted.
  getAuth0Info(auth0UserId: string): Observable<Auth0UserInfo> {
    return this.http.get<Auth0UserInfo>(`${API_BASE}/admin/trainers/${encodeURIComponent(auth0UserId)}/auth0`);
  }

  // Reuses the exact same deletion the self-service Delete My Account flow
  // uses (services/accountService.js on the server) — not a second path.
  deleteTrainer(auth0UserId: string): Observable<DeleteTrainerResult> {
    return this.http.delete<DeleteTrainerResult>(`${API_BASE}/admin/trainers/${encodeURIComponent(auth0UserId)}`);
  }
}
