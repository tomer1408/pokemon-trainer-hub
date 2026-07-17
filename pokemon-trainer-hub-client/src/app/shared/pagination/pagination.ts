import { Component, computed, input, output } from '@angular/core';

// Real, generic pagination — first genuine 2nd/3rd duplicate across list
// pages (Support, Trainers, Database Explorer), worth extracting now.
// Page numbers are windowed (current ± 2, always showing first/last) so a
// large total page count never renders hundreds of buttons.
@Component({
  selector: 'app-pagination',
  imports: [],
  templateUrl: './pagination.html',
  styleUrl: './pagination.css',
})
export class Pagination {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly isLight = input(false);
  readonly isPikachu = input(false);

  readonly pageChange = output<number>();

  protected readonly pageNumbers = computed(() => {
    const current = this.page();
    const total = this.totalPages();
    const window = 2;

    const start = Math.max(1, current - window);
    const end = Math.min(total, current + window);

    const numbers: (number | 'ellipsis')[] = [];
    if (start > 1) {
      numbers.push(1);
      if (start > 2) numbers.push('ellipsis');
    }
    for (let n = start; n <= end; n++) numbers.push(n);
    if (end < total) {
      if (end < total - 1) numbers.push('ellipsis');
      numbers.push(total);
    }
    return numbers;
  });

  protected readonly isFirstPage = computed(() => this.page() <= 1);
  protected readonly isLastPage = computed(() => this.page() >= this.totalPages());

  prev(): void {
    if (!this.isFirstPage()) this.pageChange.emit(this.page() - 1);
  }

  next(): void {
    if (!this.isLastPage()) this.pageChange.emit(this.page() + 1);
  }

  goTo(n: number | 'ellipsis'): void {
    if (n !== 'ellipsis' && n !== this.page()) this.pageChange.emit(n);
  }
}
