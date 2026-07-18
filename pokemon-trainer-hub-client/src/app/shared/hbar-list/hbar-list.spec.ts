import { TestBed } from '@angular/core/testing';
import { HBarList } from './hbar-list';

describe('HBarList', () => {
  function setup(items: { label: string; count: number }[]) {
    const fixture = TestBed.createComponent(HBarList);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    return fixture;
  }

  it('scales bars relative to the largest real value, not a fixed 0-100 scale', () => {
    const fixture = setup([
      { label: 'pikachu', count: 4 },
      { label: 'charizard', count: 2 },
    ]);
    const rows = (fixture.componentInstance as any).rows();

    expect(rows[0].pct).toBe(100);
    expect(rows[1].pct).toBe(50);
  });

  it('never divides by zero when every count is 0', () => {
    const fixture = setup([{ label: 'a', count: 0 }]);
    const rows = (fixture.componentInstance as any).rows();

    expect(rows[0].pct).toBe(0);
  });

  it('renders the real empty state for an empty list', () => {
    const fixture = setup([]);
    expect(fixture.nativeElement.textContent).toContain('No data yet.');
  });
});
