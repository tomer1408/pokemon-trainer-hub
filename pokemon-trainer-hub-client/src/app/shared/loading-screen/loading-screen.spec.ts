import { TestBed } from '@angular/core/testing';
import { LoadingScreen } from './loading-screen';

// Casts to `any` to reach the component's `protected` computed signals.
describe('LoadingScreen', () => {
  function setup() {
    const fixture = TestBed.createComponent(LoadingScreen);
    fixture.detectChanges();
    return fixture;
  }

  it('shows a fixed override message instead of rotating when message is provided', () => {
    const fixture = setup();
    fixture.componentRef.setInput('message', 'Warming up the arena…');
    fixture.detectChanges();

    expect((fixture.componentInstance as any).currentMessage()).toBe('Warming up the arena…');
  });

  it('rotates through the default (or provided) message list on a timer', () => {
    vi.useFakeTimers();
    const fixture = setup();
    const first = (fixture.componentInstance as any).currentMessage();

    vi.advanceTimersByTime(1900);
    const second = (fixture.componentInstance as any).currentMessage();

    expect(second).not.toBe(first);
    vi.useRealTimers();
  });

  it('wraps back to the first message after cycling through the whole list', () => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.componentRef.setInput('messages', ['A', 'B', 'C']);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).currentMessage()).toBe('A');
    vi.advanceTimersByTime(1900 * 3);
    expect((fixture.componentInstance as any).currentMessage()).toBe('A');
    vi.useRealTimers();
  });

  it('stops rotating once destroyed (clears the interval)', () => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.destroy();

    // Should not throw and should not keep incrementing after destroy.
    expect(() => vi.advanceTimersByTime(1900 * 5)).not.toThrow();
    vi.useRealTimers();
  });

  it('derives proportional ball dimensions from the size preset', () => {
    const fixture = setup();
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();

    // lg core is 78 -> ballSize = round(78 * 0.9) = 70
    expect((fixture.componentInstance as any).ballSize()).toBe(70);
  });

  it('uses a smaller font size for the sm preset than for md/lg', () => {
    const fixture = setup();
    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    expect((fixture.componentInstance as any).wordmarkFontSize()).toBe(11);

    fixture.componentRef.setInput('size', 'md');
    fixture.detectChanges();
    expect((fixture.componentInstance as any).wordmarkFontSize()).toBe(15);
  });
});
