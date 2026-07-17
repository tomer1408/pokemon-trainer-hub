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
});
