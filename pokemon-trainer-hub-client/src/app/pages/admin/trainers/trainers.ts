import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { AdminTrainersService } from '../../../core/admin-trainers';
import { Pagination } from '../../../shared/pagination/pagination';
import { ThemeService } from '../../../shared/theme';
import { maskAuth0Id } from '../../../shared/mask-auth0-id';

const PAGE_SIZE = 10;

// Same established list pattern as pages/admin/support/support.ts and
// pages/explorer/explorer.ts: individual filter signals, a computed query,
// an effect resetting to page 1 on a real filter change (not on page
// itself), toObservable(query).pipe(switchMap(...)) to fetch.
@Component({
  selector: 'app-admin-trainers',
  imports: [DatePipe, Pagination],
  templateUrl: './trainers.html',
  styleUrl: './trainers.css',
})
export class AdminTrainers {
  private readonly trainersService = inject(AdminTrainersService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly searchInput = signal('');
  protected readonly page = signal(1);

  private readonly debouncedSearch = toSignal(toObservable(this.searchInput).pipe(debounceTime(300)), {
    initialValue: '',
  });

  private readonly query = computed(() => ({
    search: this.debouncedSearch(),
    page: this.page(),
    pageSize: PAGE_SIZE,
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
        this.trainersService.list(q).pipe(
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

  openTrainer(auth0UserId: string): void {
    this.router.navigate(['/admin/trainers', auth0UserId]);
  }
}
