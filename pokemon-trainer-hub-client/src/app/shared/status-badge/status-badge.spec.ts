import { TestBed } from '@angular/core/testing';
import { StatusBadge, StatusBadgeVariant } from './status-badge';

describe('StatusBadge', () => {
  function setup(label: string, variant: StatusBadgeVariant = 'neutral') {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the given label', () => {
    const fixture = setup('Open');
    expect(fixture.nativeElement.textContent.trim()).toContain('Open');
  });

  it('applies the variant as a CSS class', () => {
    const fixture = setup('Urgent', 'error');
    const badge = fixture.nativeElement.querySelector('.status-badge');
    expect(badge.classList.contains('error')).toBe(true);
  });

  it('defaults to the neutral variant when none is set', () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('label', 'Low');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-badge').classList.contains('neutral')).toBe(true);
  });

  it('shows a dot only when showDot is true', () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('label', 'Open');
    fixture.componentRef.setInput('showDot', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.badge-dot')).toBeTruthy();
  });
});
