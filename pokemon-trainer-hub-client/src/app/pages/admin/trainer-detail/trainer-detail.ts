import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AdminTrainersService, Auth0UserInfo, TrainerDetail } from '../../../core/admin-trainers';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { maskAuth0Id } from '../../../shared/mask-auth0-id';
import { ThemeService } from '../../../shared/theme';

@Component({
  selector: 'app-admin-trainer-detail',
  imports: [ConfirmDialog, DatePipe],
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

  protected readonly showPermanentDeleteConfirm = signal(false);
  protected readonly permanentDeleting = signal(false);
  protected readonly permanentDeleteError = signal<string | null>(null);

  protected readonly showRestoreConfirm = signal(false);
  protected readonly restoring = signal(false);
  protected readonly restoreError = signal<string | null>(null);

  // Drives the "scheduled for deletion" banner vs. the normal Danger Zone —
  // reuses this same page/route for a soft-deleted trainer rather than a
  // parallel view.
  protected readonly isDeleted = computed(() => !!this.detail()?.profile.deletedAt);

  // Real days-remaining computed from the server's own purgeAt, never a
  // client-guessed 30 — same approach as pages/restore-account.
  protected readonly daysUntilPurge = computed(() => {
    const purgeAt = this.detail()?.profile.purgeAt;
    if (!purgeAt) return null;
    const ms = new Date(purgeAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  });

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

  // The real, irreversible force-delete — bypasses the 30-day process
  // entirely. Available both on an active trainer (an alternative to the
  // normal soft-delete above) and on an already soft-deleted one ("Delete
  // Forever").
  requestPermanentDelete(): void {
    this.permanentDeleteError.set(null);
    this.showPermanentDeleteConfirm.set(true);
  }

  cancelPermanentDelete(): void {
    this.showPermanentDeleteConfirm.set(false);
  }

  confirmPermanentDelete(): void {
    if (this.permanentDeleting()) return;
    const id = this.auth0UserId();
    this.permanentDeleting.set(true);
    this.trainersService.permanentlyDeleteTrainer(id).subscribe({
      next: () => this.router.navigate(['/admin/trainers']),
      error: () => {
        this.permanentDeleting.set(false);
        this.permanentDeleteError.set('Something went wrong permanently deleting this trainer. Please try again.');
      },
    });
  }

  // The only way a soft-deleted account ever comes back — never automatic,
  // never self-service.
  requestRestore(): void {
    this.restoreError.set(null);
    this.showRestoreConfirm.set(true);
  }

  cancelRestore(): void {
    this.showRestoreConfirm.set(false);
  }

  confirmRestore(): void {
    if (this.restoring()) return;
    const id = this.auth0UserId();
    this.restoring.set(true);
    this.trainersService.restoreTrainer(id).subscribe({
      next: () => {
        this.restoring.set(false);
        this.showRestoreConfirm.set(false);
        // Reload so the page flips back to the normal (non-deleted) view
        // with the real, current server state — not a locally-guessed one.
        this.load(id);
      },
      error: () => {
        this.restoring.set(false);
        this.restoreError.set('Something went wrong restoring this trainer. Please try again.');
      },
    });
  }
}
