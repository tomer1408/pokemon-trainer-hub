import { TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  function setup(overrides: Partial<{ requireTypedPhrase: string | null; busy: boolean }> = {}) {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.componentRef.setInput('title', 'Delete this?');
    fixture.componentRef.setInput('body', 'This cannot be undone.');
    fixture.componentRef.setInput('requireTypedPhrase', overrides.requireTypedPhrase ?? null);
    fixture.componentRef.setInput('busy', overrides.busy ?? false);
    fixture.detectChanges();
    return fixture;
  }

  it('canConfirm() is true immediately when no typed phrase is required', () => {
    const fixture = setup();
    expect((fixture.componentInstance as any).canConfirm()).toBe(true);
  });

  it('onConfirm() emits confirmed when no phrase is required', () => {
    const fixture = setup();
    const spy = vi.fn();
    fixture.componentInstance.confirmed.subscribe(spy);

    fixture.componentInstance.onConfirm();
    expect(spy).toHaveBeenCalled();
  });

  it('canConfirm() is false until the exact required phrase is typed', () => {
    const fixture = setup({ requireTypedPhrase: 'DELETE' });
    const inst = fixture.componentInstance as any;
    expect(inst.canConfirm()).toBe(false);

    inst.onTypedTextChange('delete');
    expect(inst.canConfirm()).toBe(false);

    inst.onTypedTextChange('DELETE');
    expect(inst.canConfirm()).toBe(true);
  });

  it('onConfirm() does not emit until the required phrase matches', () => {
    const fixture = setup({ requireTypedPhrase: 'Pikachu' });
    const spy = vi.fn();
    fixture.componentInstance.confirmed.subscribe(spy);

    fixture.componentInstance.onConfirm();
    expect(spy).not.toHaveBeenCalled();

    (fixture.componentInstance as any).onTypedTextChange('Pikachu');
    fixture.componentInstance.onConfirm();
    expect(spy).toHaveBeenCalled();
  });

  it('onConfirm() does nothing while busy, even if the phrase matches', () => {
    const fixture = setup({ requireTypedPhrase: 'DELETE', busy: true });
    (fixture.componentInstance as any).onTypedTextChange('DELETE');
    const spy = vi.fn();
    fixture.componentInstance.confirmed.subscribe(spy);

    fixture.componentInstance.onConfirm();
    expect(spy).not.toHaveBeenCalled();
  });

  it('onCancel() emits cancelled, unless busy', () => {
    const fixture = setup();
    const spy = vi.fn();
    fixture.componentInstance.cancelled.subscribe(spy);

    fixture.componentInstance.onCancel();
    expect(spy).toHaveBeenCalled();
  });

  it('onCancel() is a no-op while busy', () => {
    const fixture = setup({ busy: true });
    const spy = vi.fn();
    fixture.componentInstance.cancelled.subscribe(spy);

    fixture.componentInstance.onCancel();
    expect(spy).not.toHaveBeenCalled();
  });

  it('renders real dialog ARIA semantics: role, aria-modal, and a title linked via aria-labelledby', () => {
    const fixture = setup();
    const card = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;

    expect(card).toBeTruthy();
    expect(card.getAttribute('aria-modal')).toBe('true');
    const labelledBy = card.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(fixture.nativeElement.querySelector(`#${labelledBy}`)?.textContent).toContain('Delete this?');
  });

  it('moves focus onto the Cancel button once rendered, not the (destructive) Confirm button', async () => {
    const fixture = setup();
    await fixture.whenStable();

    const cancelBtn = fixture.nativeElement.querySelector('.confirm-cancel') as HTMLElement;
    expect(document.activeElement).toBe(cancelBtn);
  });

  it('Escape key triggers the same cancel behavior as clicking Cancel', () => {
    const fixture = setup();
    const spy = vi.fn();
    fixture.componentInstance.cancelled.subscribe(spy);

    (fixture.componentInstance as any).onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(spy).toHaveBeenCalled();
  });

  it('Escape is a no-op while busy, same as onCancel()', () => {
    const fixture = setup({ busy: true });
    const spy = vi.fn();
    fixture.componentInstance.cancelled.subscribe(spy);

    (fixture.componentInstance as any).onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(spy).not.toHaveBeenCalled();
  });

  it('Tab from the last focusable element wraps back to the first (focus trap)', () => {
    const fixture = setup();
    const focusable = fixture.nativeElement.querySelectorAll('button:not([disabled]), input:not([disabled])');
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    last.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    (fixture.componentInstance as any).onKeydown(event);

    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Shift+Tab from the first focusable element wraps to the last (focus trap)', () => {
    const fixture = setup();
    const focusable = fixture.nativeElement.querySelectorAll('button:not([disabled]), input:not([disabled])');
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    first.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    (fixture.componentInstance as any).onKeydown(event);

    expect(document.activeElement).toBe(last);
    expect(event.defaultPrevented).toBe(true);
  });
});
