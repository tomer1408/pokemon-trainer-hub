import { TestBed } from '@angular/core/testing';
import { AdminDataTable, formatCell } from './admin-data-table';

describe('formatCell', () => {
  it('renders null/undefined as an em dash, never "null"/"undefined" text', () => {
    expect(formatCell(null)).toBe('—');
    expect(formatCell(undefined)).toBe('—');
  });

  it('renders booleans as Yes/No', () => {
    expect(formatCell(true)).toBe('Yes');
    expect(formatCell(false)).toBe('No');
  });

  it('formats a real ISO date string via toLocaleString, not the raw ISO string', () => {
    const formatted = formatCell('2026-07-01T12:00:00.000Z');
    expect(formatted).not.toBe('2026-07-01T12:00:00.000Z');
  });

  it('JSON-stringifies a real object/array value', () => {
    expect(formatCell({ a: 1 })).toBe('{"a":1}');
  });

  it('truncates a long plain string with an ellipsis', () => {
    const long = 'x'.repeat(80);
    const formatted = formatCell(long);
    expect(formatted.length).toBeLessThan(80);
    expect(formatted.endsWith('…')).toBe(true);
  });

  it('leaves a short plain value unchanged', () => {
    expect(formatCell('Ash')).toBe('Ash');
    expect(formatCell(42)).toBe('42');
  });
});

describe('AdminDataTable', () => {
  function setup(rows: Record<string, unknown>[]) {
    const fixture = TestBed.createComponent(AdminDataTable);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    return fixture;
  }

  it('derives columns from the real union of keys across rows, first-seen order', () => {
    const fixture = setup([
      { id: 1, trainerName: 'Ash' },
      { id: 2, trainerName: 'Misty', country: 'USA' },
    ]);
    const columns = (fixture.componentInstance as any).columns();

    expect(columns).toEqual(['id', 'trainerName', 'country']);
  });

  it('emits the real clicked row via rowClick', () => {
    const fixture = setup([{ id: 1, trainerName: 'Ash' }]);
    const spy = vi.fn();
    fixture.componentInstance.rowClick.subscribe(spy);

    fixture.componentInstance.onRowClick({ id: 1, trainerName: 'Ash' });

    expect(spy).toHaveBeenCalledWith({ id: 1, trainerName: 'Ash' });
  });

  it('renders the real empty state for zero rows', () => {
    const fixture = setup([]);
    expect(fixture.nativeElement.textContent).toContain('No rows match.');
  });
});
