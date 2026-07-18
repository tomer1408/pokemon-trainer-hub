import { Component, computed, input } from '@angular/core';

export interface HBarItem {
  label: string;
  count: number;
}

interface HBarRow extends HBarItem {
  pct: number;
}

// A small, real, hand-rolled horizontal bar list — no charting library.
// Reused across Analytics for every "ranked distribution" (popular
// Pokémon, battle difficulty/opponent type, support by topic). Bars are
// scaled relative to the largest value in the list, not a fixed 0-100
// scale, so a list of small counts still fills the available width.
@Component({
  selector: 'app-hbar-list',
  imports: [],
  templateUrl: './hbar-list.html',
  styleUrl: './hbar-list.css',
})
export class HBarList {
  readonly items = input.required<HBarItem[]>();
  readonly isLight = input(false);
  readonly isPikachu = input(false);
  readonly emptyLabel = input('No data yet.');

  protected readonly rows = computed<HBarRow[]>(() => {
    const list = this.items();
    const max = Math.max(1, ...list.map((i) => i.count));
    return list.map((i) => ({ ...i, pct: Math.round((i.count / max) * 100) }));
  });
}
