import { Component, HostListener, computed, input, output, signal } from '@angular/core';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DayCell {
  day: number;
  iso: string;
  isFuture: boolean;
  isSelected: boolean;
  isToday: boolean;
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Replaces the native <input type="date"> for Date of Birth — the native
// calendar popup is OS/browser chrome that can't be restyled with CSS at
// all, which clashed with the rest of the dark-themed form. Emits/accepts
// the same plain 'YYYY-MM-DD' string the native input used, so callers
// (Onboarding's isFutureDate/isBelowMinAge checks, the submit payload) don't
// need to change at all.
@Component({
  selector: 'app-date-picker',
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.css',
})
export class DatePicker {
  readonly value = input('');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly weekdayLabels = WEEKDAY_LABELS;

  private readonly today = new Date();
  private readonly todayIso = toIso(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());
  protected readonly currentYear = this.today.getFullYear();

  protected readonly viewYear = signal(this.today.getFullYear());
  protected readonly viewMonth = signal(this.today.getMonth());

  // 'years' is a fast jump view — pick a whole year (e.g. for a decades-old
  // date of birth) instead of clicking the month arrows one year at a time.
  protected readonly pickerMode = signal<'days' | 'years'>('days');
  protected readonly yearRangeStart = signal(this.today.getFullYear());

  protected readonly monthLabel = computed(() => `${MONTH_NAMES[this.viewMonth()]} ${this.viewYear()}`);

  protected readonly yearGrid = computed(() => {
    const start = this.yearRangeStart();
    return Array.from({ length: 12 }, (_, i) => start + i);
  });

  // Explicit UTC — the stored value is a plain calendar date with no time
  // component, so formatting in the browser's local timezone could shift it
  // back a day for any timezone behind UTC (same fix as Profile's formattedDob).
  protected readonly displayValue = computed(() => {
    const v = this.value();
    if (!v) return '';
    const parsed = new Date(v);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  });

  protected readonly weeks = computed(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selected = this.value();

    const cells: (DayCell | null)[] = new Array(startWeekday).fill(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIso(year, month, day);
      cells.push({ day, iso, isFuture: iso > this.todayIso, isSelected: selected === iso, isToday: iso === this.todayIso });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: (DayCell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  });

  toggleOpen(): void {
    if (!this.open()) {
      const parsed = this.value() ? new Date(this.value()) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        this.viewYear.set(parsed.getUTCFullYear());
        this.viewMonth.set(parsed.getUTCMonth());
      } else {
        this.viewYear.set(this.today.getFullYear());
        this.viewMonth.set(this.today.getMonth());
      }
      this.pickerMode.set('days');
    }
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  openYearPicker(): void {
    this.yearRangeStart.set(this.viewYear() - (this.viewYear() % 12));
    this.pickerMode.set('years');
  }

  selectYear(year: number): void {
    this.viewYear.set(year);
    this.pickerMode.set('days');
  }

  prevYearPage(): void {
    this.yearRangeStart.update((y) => y - 12);
  }

  nextYearPage(): void {
    this.yearRangeStart.update((y) => y + 12);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  prevMonth(): void {
    this.shiftMonth(-1);
  }

  nextMonth(): void {
    this.shiftMonth(1);
  }

  prevYear(): void {
    this.viewYear.update((y) => y - 1);
  }

  nextYear(): void {
    this.viewYear.update((y) => y + 1);
  }

  private shiftMonth(delta: number): void {
    let month = this.viewMonth() + delta;
    let year = this.viewYear();
    if (month < 0) {
      month = 11;
      year--;
    } else if (month > 11) {
      month = 0;
      year++;
    }
    this.viewMonth.set(month);
    this.viewYear.set(year);
  }

  selectDay(cell: DayCell | null): void {
    if (!cell || cell.isFuture) return;
    this.valueChange.emit(cell.iso);
    this.close();
  }
}
