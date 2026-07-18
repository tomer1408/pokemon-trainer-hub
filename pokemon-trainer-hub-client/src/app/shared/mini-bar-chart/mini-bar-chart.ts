import { Component, computed, input } from '@angular/core';

export interface DailyPoint {
  date: string;
  count: number;
}

interface BarPoint extends DailyPoint {
  pctHeight: number;
}

// A small, real, hand-rolled vertical bar chart (SVG-free — plain divs
// scaled with CSS heights, since these are simple daily counts, not
// curves) — no charting library. Scaled relative to the series' own max,
// same convention as HBarList. Individual day labels are omitted in favor
// of a title tooltip per bar (a dense 30-180 day series has no room for
// per-bar text labels) plus first/last date labels under the axis.
@Component({
  selector: 'app-mini-bar-chart',
  imports: [],
  templateUrl: './mini-bar-chart.html',
  styleUrl: './mini-bar-chart.css',
})
export class MiniBarChart {
  readonly series = input.required<DailyPoint[]>();
  readonly isLight = input(false);
  readonly isPikachu = input(false);

  protected readonly bars = computed<BarPoint[]>(() => {
    const list = this.series();
    const max = Math.max(1, ...list.map((p) => p.count));
    return list.map((p) => ({ ...p, pctHeight: Math.round((p.count / max) * 100) }));
  });

  protected readonly total = computed(() => this.series().reduce((sum, p) => sum + p.count, 0));
  protected readonly firstDate = computed(() => this.series()[0]?.date ?? '');
  protected readonly lastDate = computed(() => this.series()[this.series().length - 1]?.date ?? '');
}
