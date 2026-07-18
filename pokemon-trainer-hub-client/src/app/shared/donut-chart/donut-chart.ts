import { Component, computed, input } from '@angular/core';

export interface DonutSegment {
  label: string;
  count: number;
  colorVar: string;
}

interface DonutArc extends DonutSegment {
  pct: number;
  dasharray: string;
  dashoffset: number;
}

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// A small, real, hand-rolled SVG donut chart (stroke-dasharray technique,
// no charting library) — used for Win/Loss ratio. Segment order is
// preserved from the input (caller decides display order); an empty or
// all-zero input renders nothing but the empty state, never a fake full
// circle.
@Component({
  selector: 'app-donut-chart',
  imports: [],
  templateUrl: './donut-chart.html',
  styleUrl: './donut-chart.css',
})
export class DonutChart {
  readonly segments = input.required<DonutSegment[]>();
  readonly centerLabel = input('');
  readonly isLight = input(false);
  readonly isPikachu = input(false);

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;

  protected readonly total = computed(() => this.segments().reduce((sum, s) => sum + s.count, 0));

  protected readonly arcs = computed<DonutArc[]>(() => {
    const total = this.total();
    if (total === 0) return [];

    let cumulative = 0;
    return this.segments()
      .filter((s) => s.count > 0)
      .map((s) => {
        const pct = Math.round((s.count / total) * 100);
        const segLen = (s.count / total) * CIRCUMFERENCE;
        const arc: DonutArc = {
          ...s,
          pct,
          dasharray: `${segLen} ${CIRCUMFERENCE - segLen}`,
          dashoffset: -cumulative,
        };
        cumulative += segLen;
        return arc;
      });
  });
}
