import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminOverviewService, Overview, OverviewActivityEvent } from '../../../core/admin-overview';
import { StatusBadge, StatusBadgeVariant } from '../../../shared/status-badge/status-badge';
import { ThemeService } from '../../../shared/theme';

interface KpiCard {
  label: string;
  value: number;
  sub: string;
}

// Phase 3: replaces the Phase 0 placeholder at this same `/admin` route with
// the real Admin Overview — one GET /api/admin/overview call combining real
// KPIs (count/groupBy queries, never invented), the 5 most recent support
// requests, and the ~10 most recent real cross-model events. Deliberately
// omits the mockup's "System Status" card — that belongs to Phase 4 (System
// Health), which doesn't exist yet; linking to it here would be premature.
@Component({
  selector: 'app-admin-overview',
  imports: [DatePipe, StatusBadge],
  templateUrl: './overview.html',
  styleUrl: './overview.css',
})
export class AdminOverview {
  private readonly adminOverviewService = inject(AdminOverviewService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly overview = signal<Overview | null>(null);

  protected readonly kpiCards = computed<KpiCard[]>(() => {
    const o = this.overview();
    if (!o) return [];
    const k = o.kpis;
    return [
      { label: 'Total Trainers', value: k.totalTrainers, sub: 'all registered profiles' },
      { label: 'New This Week', value: k.newTrainersLast7Days, sub: 'joined in the last 7 days' },
      { label: 'Open Support Requests', value: k.openSupportRequests, sub: 'awaiting a response' },
      { label: 'Quiz Completed', value: k.quizCompletedCount, sub: 'finished the starter quiz' },
      { label: 'Trainers With a Team', value: k.trainersWithTeamCount, sub: 'at least 1 Pokémon' },
      { label: 'Full Teams', value: k.fullTeamsCount, sub: '5 / 5 Pokémon' },
      { label: 'Battles This Week', value: k.battlesLast7Days, sub: 'fought in the last 7 days' },
    ];
  });

  constructor() {
    this.adminOverviewService.getOverview().subscribe({
      next: (o) => {
        this.overview.set(o);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  statusVariant(status: string): StatusBadgeVariant {
    return status === 'resolved' ? 'success' : status === 'in_progress' ? 'warning' : 'info';
  }

  priorityVariant(priority: string): StatusBadgeVariant {
    return priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : priority === 'normal' ? 'info' : 'neutral';
  }

  activityText(a: OverviewActivityEvent): string {
    switch (a.type) {
      case 'trainer_joined':
        return `${a.trainerName} joined as a new trainer`;
      case 'team_member_added':
        return `${a.trainerName} added ${a.detail} to their Dream Team`;
      case 'battle_completed':
        return `${a.trainerName} battled — ${a.detail}`;
      case 'support_request_created':
        return `${a.trainerName} opened a support request: ${a.detail}`;
    }
  }

  goToSupport(): void {
    this.router.navigate(['/admin/support']);
  }
}
