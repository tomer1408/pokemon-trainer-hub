import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import {
  AdminSupportService,
  SupportPriority,
  SupportRequestDetail,
  SupportStatus,
} from '../../../core/admin-support';
import { Pagination } from '../../../shared/pagination/pagination';
import { StatusBadge } from '../../../shared/status-badge/status-badge';
import { ThemeService } from '../../../shared/theme';

const PAGE_SIZE = 10;
const STATUS_OPTIONS: SupportStatus[] = ['open', 'in_progress', 'resolved'];
const PRIORITY_OPTIONS: SupportPriority[] = ['low', 'normal', 'high', 'urgent'];

// Real, server-side pagination/filter/search — same pattern already
// established in pages/explorer/explorer.ts: individual filter signals,
// a computed query, an effect that resets to page 1 whenever a non-page
// filter changes, toObservable(query).pipe(switchMap(...)) to fetch.
@Component({
  selector: 'app-admin-support',
  imports: [DatePipe, Pagination, StatusBadge],
  templateUrl: './support.html',
  styleUrl: './support.css',
})
export class AdminSupport {
  private readonly adminSupportService = inject(AdminSupportService);
  protected readonly theme = inject(ThemeService);

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly priorityOptions = PRIORITY_OPTIONS;

  protected readonly searchInput = signal('');
  protected readonly statusFilter = signal<SupportStatus | ''>('');
  protected readonly priorityFilter = signal<SupportPriority | ''>('');
  protected readonly page = signal(1);
  private readonly refreshTick = signal(0);

  private readonly debouncedSearch = toSignal(toObservable(this.searchInput).pipe(debounceTime(300)), {
    initialValue: '',
  });

  private readonly query = computed(() => ({
    search: this.debouncedSearch(),
    status: this.statusFilter() || undefined,
    priority: this.priorityFilter() || undefined,
    page: this.page(),
    pageSize: PAGE_SIZE,
    // Not read by the server — just a dependency so re-incrementing it
    // forces the list to refetch after an update in the drawer.
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
        this.adminSupportService.list(q).pipe(
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

  protected readonly requests = computed(() => this.listResult()?.results ?? []);
  protected readonly total = computed(() => this.listResult()?.total ?? 0);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  // Drawer state
  protected readonly selected = signal<SupportRequestDetail | null>(null);
  protected readonly loadingDetail = signal(false);
  protected readonly savingStatusOrPriority = signal(false);
  protected readonly notesDraft = signal('');
  protected readonly assignedDraft = signal('');
  protected readonly savingNotes = signal(false);

  constructor() {
    // Reset to page 1 whenever a real filter changes — page itself is
    // deliberately excluded so paging doesn't loop back to page 1.
    effect(() => {
      this.debouncedSearch();
      this.statusFilter();
      this.priorityFilter();
      untracked(() => this.page.set(1));
    });
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  openRequest(id: number): void {
    this.loadingDetail.set(true);
    this.adminSupportService.getById(id).subscribe({
      next: (detail) => {
        this.selected.set(detail);
        this.notesDraft.set(detail.adminNotes ?? '');
        this.assignedDraft.set(detail.assignedTo ?? '');
        this.loadingDetail.set(false);
      },
      error: () => this.loadingDetail.set(false),
    });
  }

  closeDrawer(): void {
    this.selected.set(null);
  }

  setStatus(status: SupportStatus): void {
    const sel = this.selected();
    if (!sel || sel.status === status || this.savingStatusOrPriority()) return;
    this.updateSelected({ status });
  }

  setPriority(priority: SupportPriority): void {
    const sel = this.selected();
    if (!sel || sel.priority === priority || this.savingStatusOrPriority()) return;
    this.updateSelected({ priority });
  }

  markResolved(): void {
    this.setStatus('resolved');
  }

  saveNotesAndAssignment(): void {
    if (this.savingNotes()) return;
    this.savingNotes.set(true);
    const sel = this.selected();
    if (!sel) return;
    this.adminSupportService.update(sel.id, { adminNotes: this.notesDraft(), assignedTo: this.assignedDraft() }).subscribe({
      next: (updated) => {
        this.selected.update((s) => (s ? { ...s, ...updated } : s));
        this.savingNotes.set(false);
        this.refreshTick.update((n) => n + 1);
      },
      error: () => this.savingNotes.set(false),
    });
  }

  private updateSelected(patch: { status?: SupportStatus; priority?: SupportPriority }): void {
    const sel = this.selected();
    if (!sel) return;
    this.savingStatusOrPriority.set(true);
    this.adminSupportService.update(sel.id, patch).subscribe({
      next: (updated) => {
        this.selected.update((s) => (s ? { ...s, ...updated } : s));
        this.savingStatusOrPriority.set(false);
        this.refreshTick.update((n) => n + 1);
      },
      error: () => this.savingStatusOrPriority.set(false),
    });
  }

  emailTrainer(email: string): void {
    window.location.href = `mailto:${email}`;
  }
}
