import { TestBed } from '@angular/core/testing';
import { PolicyModal } from './policy-modal';

describe('PolicyModal', () => {
  function setup(type: 'terms' | 'privacy') {
    const fixture = TestBed.createComponent(PolicyModal);
    fixture.componentInstance.type = type;
    fixture.detectChanges();
    return fixture;
  }

  it('shows the Terms title/body for type "terms"', () => {
    const fixture = setup('terms');
    expect((fixture.componentInstance as any).title()).toBe('Terms of Use');
    expect((fixture.componentInstance as any).body()).toContain('Terms of Use');
  });

  it('shows the Privacy title/body for type "privacy"', () => {
    const fixture = setup('privacy');
    expect((fixture.componentInstance as any).title()).toBe('Privacy Policy');
    expect((fixture.componentInstance as any).body()).toContain('Privacy Policy');
  });

  it('onClose() emits closed', () => {
    const fixture = setup('terms');
    let emitted = false;
    fixture.componentInstance.closed.subscribe(() => (emitted = true));

    fixture.componentInstance.onClose();

    expect(emitted).toBe(true);
  });
});
