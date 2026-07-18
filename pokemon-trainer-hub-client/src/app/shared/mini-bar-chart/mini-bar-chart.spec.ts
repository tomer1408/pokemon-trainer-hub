import { TestBed } from '@angular/core/testing';
import { MiniBarChart } from './mini-bar-chart';

describe('MiniBarChart', () => {
  function setup(series: { date: string; count: number }[]) {
    const fixture = TestBed.createComponent(MiniBarChart);
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();
    return fixture;
  }

  it('scales each bar relative to the series real max', () => {
    const fixture = setup([
      { date: '2026-07-01', count: 3 },
      { date: '2026-07-02', count: 6 },
    ]);
    const bars = (fixture.componentInstance as any).bars();

    expect(bars[0].pctHeight).toBe(50);
    expect(bars[1].pctHeight).toBe(100);
  });

  it('sums the real total across the series', () => {
    const fixture = setup([
      { date: '2026-07-01', count: 3 },
      { date: '2026-07-02', count: 6 },
    ]);

    expect((fixture.componentInstance as any).total()).toBe(9);
  });

  it('exposes the real first/last date labels for the axis', () => {
    const fixture = setup([
      { date: '2026-07-01', count: 1 },
      { date: '2026-07-02', count: 2 },
      { date: '2026-07-03', count: 3 },
    ]);

    expect((fixture.componentInstance as any).firstDate()).toBe('2026-07-01');
    expect((fixture.componentInstance as any).lastDate()).toBe('2026-07-03');
  });
});
