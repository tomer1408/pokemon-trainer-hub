import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';
import { SupportPriority, SupportStatus } from './admin-support';

export interface OverviewKpis {
  totalTrainers: number;
  newTrainersLast7Days: number;
  openSupportRequests: number;
  quizCompletedCount: number;
  trainersWithTeamCount: number;
  fullTeamsCount: number;
  battlesLast7Days: number;
}

export interface OverviewSupportRequest {
  id: number;
  name: string;
  topic: string;
  status: SupportStatus;
  priority: SupportPriority;
  createdAt: string;
}

export type OverviewActivityType =
  | 'trainer_joined'
  | 'team_member_added'
  | 'battle_completed'
  | 'support_request_created';

export interface OverviewActivityEvent {
  type: OverviewActivityType;
  auth0UserId: string;
  detail: string;
  trainerName: string;
  createdAt: string;
}

export interface Overview {
  kpis: OverviewKpis;
  recentSupportRequests: OverviewSupportRequest[];
  recentActivity: OverviewActivityEvent[];
}

@Injectable({ providedIn: 'root' })
export class AdminOverviewService {
  private readonly http = inject(HttpClient);

  getOverview(): Observable<Overview> {
    return this.http.get<Overview>(`${API_BASE}/admin/overview`);
  }
}
