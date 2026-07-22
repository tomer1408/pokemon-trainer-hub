import { Component, computed, inject, signal, untracked, effect } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { AdminDatabaseService, DatabaseRecord, DatabaseTableSummary } from '../../../core/admin-database';
import { AdminDataTable, formatCell } from '../../../shared/admin-data-table/admin-data-table';
import { Pagination } from '../../../shared/pagination/pagination';
import { ThemeService } from '../../../shared/theme';

const PAGE_SIZE = 20;
const JSON_FIELD_RE = /^[[{]/;

interface DetailField {
  key: string;
  value: string;
  isJson: boolean;
}

// Phase 6: a real, read-only, generic browser over the whitelisted
// tables in services/adminDatabaseRegistry.js. Every response already
// arrives masked/stripped server-side (never re-masked here) — this page
// only ever issues GETs, never writes anything.
@Component({
  selector: 'app-admin-database',
  imports: [AdminDataTable, Pagination],
  templateUrl: './database.html',
  styleUrl: './database.css',
})
export class AdminDatabase {
  private readonly adminDatabaseService = inject(AdminDatabaseService);
  protected readonly theme = inject(ThemeService);

  protected readonly tables = signal<DatabaseTableSummary[]>([]);
  protected readonly tablesLoading = signal(true);
  protected readonly selectedTable = signal<string | null>(null);

  protected readonly searchInput = signal('');
  protected readonly page = signal(1);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal(false);

  private readonly debouncedSearch = toSignal(toObservable(this.searchInput).pipe(debounceTime(300)), {
    initialValue: '',
  });

  private readonly query = computed(() => ({
    table: this.selectedTable(),
    search: this.debouncedSearch(),
    page: this.page(),
  }));

  private readonly listResult = toSignal(
    toObservable(this.query).pipe(
      tap(() => {
        this.isLoading.set(true);
        this.loadError.set(false);
      }),
      switchMap((q) => {
        if (!q.table) return of(null);
        return this.adminDatabaseService
          .listRecords(q.table, { search: q.search, page: q.page, pageSize: PAGE_SIZE })
          .pipe(
            catchError(() => {
              this.loadError.set(true);
              return of(null);
            }),
          );
      }),
      tap(() => this.isLoading.set(false)),
    ),
    { initialValue: null },
  );

  protected readonly rows = computed<DatabaseRecord[]>(() => this.listResult()?.results ?? []);
  protected readonly total = computed(() => this.listResult()?.total ?? 0);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  protected readonly currentTableMeta = computed(
    () => this.tables().find((t) => t.key === this.selectedTable()) ?? null,
  );

  // Detail drawer state
  protected readonly selectedIndex = signal<number | null>(null);
  protected readonly selectedRecord = signal<DatabaseRecord | null>(null);
  protected readonly loadingDetail = signal(false);

  protected readonly detailFields = computed<DetailField[]>(() => {
    const record = this.selectedRecord();
    if (!record) return [];
    return Object.entries(record).map(([key, value]) => {
      const isJson = typeof value === 'string' && JSON_FIELD_RE.test(value.trim());
      return { key, value: isJson ? prettyJson(value as string) : formatCell(value), isJson };
    });
  });

  constructor() {
    this.adminDatabaseService.listTables().subscribe({
      next: (tables) => {
        this.tables.set(tables);
        this.tablesLoading.set(false);
        if (tables.length > 0) this.selectedTable.set(tables[0].key);
      },
      error: () => this.tablesLoading.set(false),
    });

    // Reset to page 1 whenever the table or search changes — page itself
    // is deliberately excluded so paging doesn't loop back to page 1.
    effect(() => {
      this.selectedTable();
      this.debouncedSearch();
      untracked(() => this.page.set(1));
    });
  }

  selectTable(key: string): void {
    this.selectedTable.set(key);
    this.closeDrawer();
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  openRecord(row: DatabaseRecord): void {
    const table = this.selectedTable();
    const id = row['id'];
    if (!table || typeof id !== 'number') return;

    this.selectedIndex.set(this.rows().findIndex((r) => r['id'] === id));
    this.loadingDetail.set(true);
    this.adminDatabaseService.getRecord(table, id).subscribe({
      next: (record) => {
        this.selectedRecord.set(record);
        this.loadingDetail.set(false);
      },
      error: () => this.loadingDetail.set(false),
    });
  }

  closeDrawer(): void {
    this.selectedIndex.set(null);
    this.selectedRecord.set(null);
  }

  navigateDetail(direction: 1 | -1): void {
    const index = this.selectedIndex();
    if (index === null) return;
    const nextIndex = index + direction;
    const row = this.rows()[nextIndex];
    if (!row) return;
    this.openRecord(row);
  }
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
