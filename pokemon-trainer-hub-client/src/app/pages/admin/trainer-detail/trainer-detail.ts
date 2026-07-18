import { Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AdminTrainersService, Auth0UserInfo, TrainerDetail } from '../../../core/admin-trainers';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { maskAuth0Id } from '../../../shared/mask-auth0-id';
import { ThemeService } from '../../../shared/theme';

@Component({
  selector: 'app-admin-trainer-detail',
  imports: [ConfirmDialog],
  templateUrl: './trainer-detail.html',
  styleUrl: './trainer-detail.css',
})
export class AdminTrainerDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly trainersService = inject(AdminTrainersService);
  protected readonly theme = inject(ThemeService);

  private readonly auth0UserId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly detail = signal<TrainerDetail | null>(null);

  // Real Auth0 info is fetched on demand only (not on page load) — it's a
  // live Management API call, not something to fire automatically every
  // time an admin opens a trainer.
  protected readonly auth0Info = signal<Auth0UserInfo | null>(null);
  protected readonly loadingAuth0 = signal(false);
  protected readonly auth0Error = signal<string | null>(null);

  protected readonly showDeleteConfirm = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.auth0UserId();
      if (!id) return;
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.trainersService.getDetail(id).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  refreshAuth0Info(): void {
    const id = this.auth0UserId();
    if (!id || this.loadingAuth0()) return;
    this.loadingAuth0.set(true);
    this.auth0Error.set(null);
    this.trainersService.getAuth0Info(id).subscribe({
      next: (info) => {
        this.auth0Info.set(info);
        this.loadingAuth0.set(false);
      },
      error: () => {
        this.auth0Error.set('Could not reach Auth0 for this trainer.');
        this.loadingAuth0.set(false);
      },
    });
  }

  maskId(id: string): string {
    return maskAuth0Id(id);
  }

  requestDelete(): void {
    this.deleteError.set(null);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
  }

  confirmDelete(): void {
    if (this.deleting()) return;
    const id = this.auth0UserId();
    this.deleting.set(true);
    this.trainersService.deleteTrainer(id).subscribe({
      next: () => this.router.navigate(['/admin/trainers']),
      error: () => {
        this.deleting.set(false);
        this.deleteError.set('Something went wrong deleting this trainer. Please try again.');
      },
    });
  }

  backToList(): void {
    this.router.navigate(['/admin/trainers']);
  }
}
