import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { InfoTooltip } from './info-tooltip';

// Real click/Escape/scrim interaction tests — this component only exists
// because the native `title` attribute doesn't respond reliably to
// click/touch/keyboard focus (see the component's own doc comment), so the
// thing actually worth verifying is that clicking, Escape, and the scrim
// genuinely open/close it, not just that the template compiles.
describe('InfoTooltip', () => {
  function setup(text = 'Explanation text') {
    const fixture = TestBed.createComponent(InfoTooltip);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    return fixture;
  }

  it('is closed by default', () => {
    const fixture = setup();
    expect(fixture.debugElement.query(By.css('.info-popover'))).toBeNull();
    expect(fixture.debugElement.query(By.css('button')).nativeElement.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on click and shows the provided text', () => {
    const fixture = setup('Team Power sums baseExperience across your team.');
    fixture.debugElement.query(By.css('button')).nativeElement.click();
    fixture.detectChanges();

    const popover = fixture.debugElement.query(By.css('.info-popover'));
    expect(popover).not.toBeNull();
    expect(popover.nativeElement.textContent.trim()).toBe('Team Power sums baseExperience across your team.');
  });

  it('closes again on a second click (toggle)', () => {
    const fixture = setup();
    const button = fixture.debugElement.query(By.css('button')).nativeElement;
    button.click();
    fixture.detectChanges();
    button.click();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.info-popover'))).toBeNull();
  });

  it('closes when the scrim is clicked', () => {
    const fixture = setup();
    fixture.debugElement.query(By.css('button')).nativeElement.click();
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.scrim')).nativeElement.click();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.info-popover'))).toBeNull();
  });

  it('closes on Escape', () => {
    const fixture = setup();
    fixture.debugElement.query(By.css('button')).nativeElement.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.info-popover'))).toBeNull();
  });
});
