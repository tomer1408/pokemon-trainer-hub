import { Component, input } from '@angular/core';

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

// Real, generic status/priority pill — reused across Support (status: open/
// in_progress/resolved, priority: low/normal/high/urgent), and later phases
// (Trainers, System Health). Color mapping matches the design mockup's own
// supStatusMeta/prioMeta: open->info, in_progress->warning, resolved->
// success; low->neutral, normal->info, high->warning, urgent->error.
@Component({
  selector: 'app-status-badge',
  imports: [],
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.css',
})
export class StatusBadge {
  readonly label = input.required<string>();
  readonly variant = input<StatusBadgeVariant>('neutral');
  readonly showDot = input(false);
  readonly isLight = input(false);
  readonly isPikachu = input(false);
}
