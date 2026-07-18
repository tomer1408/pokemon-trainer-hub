import { Component, computed, input, output } from '@angular/core';

export type DataRow = Record<string, unknown>;

const CELL_TRUNCATE_LENGTH = 40;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Real, generic formatting for a value whose type isn't known ahead of
// time (this is the one place in the app that genuinely needs to render an
// arbitrary Prisma-shaped value) — never invents a label, just renders
// what's actually there in a readable form.
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }
  if (typeof value === 'object') return JSON.stringify(value);
  const str = String(value);
  return str.length > CELL_TRUNCATE_LENGTH ? `${str.slice(0, CELL_TRUNCATE_LENGTH)}…` : str;
}

// A genuinely model-agnostic data grid — the one place in the Admin
// Dashboard that needs to render a fully dynamic row shape, unlike
// Support/Trainers which have their own fixed-column hand-rolled tables.
// Columns are derived from the union of keys actually present across the
// given rows (preserving first-seen order), not hardcoded — so it renders
// correctly for any of the 8 registered tables without per-table markup.
@Component({
  selector: 'app-admin-data-table',
  imports: [],
  templateUrl: './admin-data-table.html',
  styleUrl: './admin-data-table.css',
})
export class AdminDataTable {
  readonly rows = input.required<DataRow[]>();
  readonly idField = input('id');
  readonly isLight = input(false);
  readonly isPikachu = input(false);

  readonly rowClick = output<DataRow>();

  protected readonly formatCell = formatCell;

  protected readonly columns = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const row of this.rows()) {
      for (const key of Object.keys(row)) seen.add(key);
    }
    return [...seen];
  });

  protected rowKey(row: DataRow, index: number): unknown {
    return row[this.idField()] ?? index;
  }

  onRowClick(row: DataRow): void {
    this.rowClick.emit(row);
  }
}
