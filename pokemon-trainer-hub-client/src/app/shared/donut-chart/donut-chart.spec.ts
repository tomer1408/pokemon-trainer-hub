import { TestBed } from '@angular/core/testing';
import { DonutChart } from './donut-chart';

describe('DonutChart', () => {
  function setup(segments: { label: string; count: number; colorVar: string }[]) {
    const fixture = TestBed.createComponent(DonutChart);
    fixture.componentRef.setInput('segments', segments);
    fixture.detectChanges();
    return fixture;
  }

  it('computes real percentages that reflect each segment share of the real total', () => {
    const fixture = setup([
      { label: 'win', count: 7, colorVar: 'var(--success)' },
      { label: 'loss', count: 3, colorVar: 'var(--danger)' },
    ]);
    const arcs = (fixture.componentInstance as any).arcs();

    expect(arcs[0].pct).toBe(70);
    expect(arcs[1].pct).toBe(30);
    expect((fixture.componentInstance as any).total()).toBe(10);
  });

  it('never renders a fake full circle when every count is 0', () => {
    const fixture = setup([{ label: 'win', count: 0, colorVar: 'var(--success)' }]);

    expect((fixture.componentInstance as any).arcs().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('No data yet.');
  });

  it('excludes zero-count segments from the arcs even when other segments have real data', () => {
    const fixture = setup([
      { label: 'win', count: 5, colorVar: 'var(--success)' },
      { label: 'loss', count: 0, colorVar: 'var(--danger)' },
    ]);
    const arcs = (fixture.componentInstance as any).arcs();

    expect(arcs.length).toBe(1);
    expect(arcs[0].label).toBe('win');
  });

  it('accumulates each arc real dashoffset from the segments before it', () => {
    const fixture = setup([
      { label: 'a', count: 5, colorVar: 'var(--success)' },
      { label: 'b', count: 5, colorVar: 'var(--danger)' },
    ]);
    const arcs = (fixture.componentInstance as any).arcs();

    expect(arcs[0].dashoffset).toBe(-0);
    expect(arcs[1].dashoffset).toBeLessThan(0);
  });
});
