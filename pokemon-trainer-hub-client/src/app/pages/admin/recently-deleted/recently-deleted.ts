import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { AdminTrainersService, DeletedTrainerListItem } from '../../../core/admin-trainers';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Pagination } from '../../../shared/pagination/pagination';
import { StatusBadge, StatusBadgeVariant } from '../../../shared/status-badge/status-badge';
import { maskAuth0Id } from '../../../shared/mask-auth0-id';
import { ThemeService } from '../../../shared/theme';

const PAGE_SIZE = 10;

// Same established list pattern as pages/admin/trainers/trainers.ts and
// pages/admin/support/support.ts. The only real difference: each row here
// has its own Restore/Delete Forever actions (routes/adminTrainers.js's
// PATCH /:id/restore and DELETE /:id/permanent), rather than click-through
// to a detail page — an admin working this queue needs to act on many rows
// quickly, not read one at a time.
@Component({
  selector: 'app-admin-recently-deleted',
  imports: [DatePipe, Pagination, StatusBadge, ConfirmDialog],
  templateUrl: './recently-deleted.html',
  styleUrl: './recently-deleted.css',
})
export class AdminRecentlyDeleted {
  private readonly trainersService = inject(AdminTrainersService);
  protected readonly theme = inject(ThemeService);

  protected readonly searchInput = signal('');
  protected readonly page = signal(1);
  private readonly refreshTick = signal(0);

  private readonly debouncedSearch = toSignal(toObservable(this.searchInput).pipe(debounceTime(300)), {
    initialValue: '',
  });

  private readonly query = computed(() => ({
    search: this.debouncedSearch(),
    page: this.page(),
    pageSize: PAGE_SIZE,
    // Not read by the server — just a dependency so re-incrementing it
    // forces the list to refetch after a restore/permanent-delete.
    _refresh: this.refreshTick(),
  }));

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal(false);

  private readonly listResult = toSignal(
    toObservable(this.query).pipe(
      tap(() => {
        this.isLoading.set(true);
        this.loadError.set(false);
      }),
      switchMap((q) =>
        this.trainersService.listDeleted(q).pipe(
          catchError(() => {
            this.loadError.set(true);
            return of(null);
          }),
        ),
      ),
      tap(() => this.isLoading.set(false)),
    ),
    { initialValue: null },
  );

  protected readonly trainers = computed(() => this.listResult()?.results ?? []);
  protected readonly total = computed(() => this.listResult()?.total ?? 0);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  // Which row's dialog is open — null means neither dialog is showing.
  protected readonly restoreTarget = signal<DeletedTrainerListItem | null>(null);
  protected readonly permanentDeleteTarget = signal<DeletedTrainerListItem | null>(null);
  protected readonly actionBusy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.debouncedSearch();
      untracked(() => this.page.set(1));
    });
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  maskId(id: string): string {
    return maskAuth0Id(id);
  }

  deletionTypeVariant(deletionType: string): StatusBadgeVariant {
    return deletionType === 'admin' ? 'error' : 'info';
  }

  requestRestore(item: DeletedTrainerListItem): void {
    this.actionError.set(null);
    this.restoreTarget.set(item);
  }

  cancelRestore(): void {
    this.restoreTarget.set(null);
  }

  confirmRestore(): void {
    const target = this.restoreTarget();
    if (!target || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.trainersService.restoreTrainer(target.auth0UserId).subscribe({
      next: () => {
        this.actionBusy.set(false);
        this.restoreTarget.set(null);
        this.refreshTick.update((n) => n + 1);
      },
      error: () => {
        this.actionBusy.set(false);
        this.actionError.set('Something went wrong restoring this trainer. Please try again.');
      },
    });
  }

  requestPermanentDelete(item: DeletedTrainerListItem): void {
    this.actionError.set(null);
    this.permanentDeleteTarget.set(item);
  }

  cancelPermanentDelete(): void {
    this.permanentDeleteTarget.set(null);
  }

  confirmPermanentDelete(): void {
    const target = this.permanentDeleteTarget();
    if (!target || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.trainersService.permanentlyDeleteTrainer(target.auth0UserId).subscribe({
      next: () => {
        this.actionBusy.set(false);
        this.permanentDeleteTarget.set(null);
        this.refreshTick.update((n) => n + 1);
      },
      error: () => {
        this.actionBusy.set(false);
        this.actionError.set('Something went wrong permanently deleting this trainer. Please try again.');
      },
    });
  }
}
