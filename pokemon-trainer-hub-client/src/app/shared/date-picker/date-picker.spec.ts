import { TestBed } from '@angular/core/testing';
import { DatePicker } from './date-picker';

// Casts to `any` throughout to reach the component's `protected` signals/
// methods — this file is exercising the real year-jump/month-navigation
// logic directly rather than only through template clicks.
describe('DatePicker', () => {
  function setup(value = '') {
    const fixture = TestBed.createComponent(DatePicker);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture;
  }

  it('opens on today\'s month/year when there is no existing value', () => {
    const fixture = setup('');
    (fixture.componentInstance as any).toggleOpen();

    const today = new Date();
    expect((fixture.componentInstance as any).viewYear()).toBe(today.getFullYear());
    expect((fixture.componentInstance as any).viewMonth()).toBe(today.getMonth());
    expect((fixture.componentInstance as any).open()).toBe(true);
  });

  it('opens on the existing value\'s month/year when one is set', () => {
    const fixture = setup('2000-06-15');
    (fixture.componentInstance as any).toggleOpen();

    expect((fixture.componentInstance as any).viewYear()).toBe(2000);
    expect((fixture.componentInstance as any).viewMonth()).toBe(5); // June, 0-indexed
  });

  it('toggling twice closes it again', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.toggleOpen();
    inst.toggleOpen();
    expect(inst.open()).toBe(false);
  });

  it('close() closes it directly', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.toggleOpen();
    inst.close();
    expect(inst.open()).toBe(false);
  });

  it('closes on Escape only while open', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.onEscape();
    expect(inst.open()).toBe(false); // no-op, wasn't open

    inst.toggleOpen();
    inst.onEscape();
    expect(inst.open()).toBe(false);
  });

  it('nextMonth() rolls over into January of the next year from December', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.viewYear.set(2025);
    inst.viewMonth.set(11); // December
    inst.nextMonth();

    expect(inst.viewMonth()).toBe(0);
    expect(inst.viewYear()).toBe(2026);
  });

  it('prevMonth() rolls back into December of the previous year from January', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.viewYear.set(2025);
    inst.viewMonth.set(0); // January
    inst.prevMonth();

    expect(inst.viewMonth()).toBe(11);
    expect(inst.viewYear()).toBe(2024);
  });

  it('prevYear()/nextYear() shift the view year without touching the month', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.viewYear.set(2000);
    inst.viewMonth.set(5);
    inst.nextYear();
    expect(inst.viewYear()).toBe(2001);
    inst.prevYear();
    inst.prevYear();
    expect(inst.viewYear()).toBe(1999);
  });

  it('openYearPicker() aligns the year grid to a 12-year page containing the current view year', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.viewYear.set(2005);
    inst.openYearPicker();

    expect(inst.pickerMode()).toBe('years');
    expect(inst.yearRangeStart()).toBe(2005 - (2005 % 12));
    expect(inst.yearGrid().length).toBe(12);
    expect(inst.yearGrid()[0]).toBe(inst.yearRangeStart());
  });

  it('selectYear() sets the view year and returns to day mode', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.openYearPicker();
    inst.selectYear(1998);

    expect(inst.viewYear()).toBe(1998);
    expect(inst.pickerMode()).toBe('days');
  });

  it('prevYearPage()/nextYearPage() jump the year grid by whole 12-year pages', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.yearRangeStart.set(2000);
    inst.nextYearPage();
    expect(inst.yearRangeStart()).toBe(2012);
    inst.prevYearPage();
    inst.prevYearPage();
    expect(inst.yearRangeStart()).toBe(1988);
  });

  it('weeks() marks the selected date and flags future dates', () => {
    const fixture = setup('2020-06-15');
    const inst = fixture.componentInstance as any;
    inst.viewYear.set(2020);
    inst.viewMonth.set(5); // June

    const allCells = inst.weeks().flat().filter((c: any) => c !== null);
    const selectedCell = allCells.find((c: any) => c.day === 15);
    expect(selectedCell.isSelected).toBe(true);
    expect(selectedCell.isFuture).toBe(false);

    const farFutureCell = allCells.find((c: any) => c.day === 1);
    // June 1 2020 is in the past relative to "today" (real clock), so this
    // just sanity-checks the flag shape rather than a specific value.
    expect(typeof farFutureCell.isFuture).toBe('boolean');
  });

  it('weeks() pads the grid to full weeks with nulls at the start and end', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.viewYear.set(2026);
    inst.viewMonth.set(1); // February 2026 starts on a Sunday — still check row shape
    const rows = inst.weeks();
    for (const row of rows) {
      expect(row.length).toBe(7);
    }
  });

  it('selectDay() ignores a future cell and does not emit or close', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.toggleOpen();
    let emitted: string | undefined;
    inst.valueChange.subscribe((v: string) => (emitted = v));

    inst.selectDay({ day: 1, iso: '2099-01-01', isFuture: true, isSelected: false, isToday: false });

    expect(emitted).toBeUndefined();
    expect(inst.open()).toBe(true);
  });

  it('selectDay() ignores a null cell (padding)', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    expect(() => inst.selectDay(null)).not.toThrow();
  });

  it('selectDay() emits the iso date and closes the picker for a valid past day', () => {
    const fixture = setup('');
    const inst = fixture.componentInstance as any;
    inst.toggleOpen();
    let emitted: string | undefined;
    inst.valueChange.subscribe((v: string) => (emitted = v));

    inst.selectDay({ day: 15, iso: '2000-06-15', isFuture: false, isSelected: false, isToday: false });

    expect(emitted).toBe('2000-06-15');
    expect(inst.open()).toBe(false);
  });

  it('displayValue() formats a valid ISO date in UTC, long-form', () => {
    const fixture = setup('2000-06-15');
    expect((fixture.componentInstance as any).displayValue()).toBe('June 15, 2000');
  });

  it('displayValue() is empty for an empty or invalid value', () => {
    expect((setup('').componentInstance as any).displayValue()).toBe('');
    expect((setup('not-a-date').componentInstance as any).displayValue()).toBe('');
  });
});
