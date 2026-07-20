import { Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Generalizes the ad hoc confirm-overlay/confirm-card pattern already used
// in manage-team.ts and (until this refactor) settings.ts's Delete My
// Account dialog — one real shared implementation instead of near-duplicate
// copies. Supports the "type an exact phrase to confirm" gate that
// irreversible actions (account deletion) need, optional — plain confirms
// (e.g. a status change) just omit requireTypedPhrase.
@Component({
  selector: 'app-confirm-dialog',
  imports: [],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly destructive = input(false);
  // Set to require typing this exact string before the confirm button
  // enables (e.g. 'DELETE', or a trainer's real name) — null means no gate.
  readonly requireTypedPhrase = input<string | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly isLight = input(false);
  readonly isPikachu = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly typedText = signal('');
  protected readonly canConfirm = computed(() => {
    const phrase = this.requireTypedPhrase();
    return phrase === null || this.typedText() === phrase;
  });

  // Card + Cancel button refs, used only for focus management below — this
  // component is created fresh each time a caller's @if flips true (see
  // e.g. settings.ts's showDeleteConfirm), so afterNextRender here really
  // does mean "just opened," every time.
  private readonly cardRef = viewChild<ElementRef<HTMLElement>>('card');
  private readonly cancelBtnRef = viewChild<ElementRef<HTMLButtonElement>>('cancelBtn');

  constructor() {
    // Focus lands on Cancel, not Confirm — the safe default for a dialog
    // guarding an irreversible action, so a stray Enter/Space keypress
    // right after opening can't accidentally confirm it.
    afterNextRender(() => this.cancelBtnRef()?.nativeElement.focus());
  }

  onTypedTextChange(value: string): void {
    this.typedText.set(value);
  }

  onConfirm(): void {
    if (!this.canConfirm() || this.busy()) return;
    this.confirmed.emit();
  }

  onCancel(): void {
    if (this.busy()) return;
    this.cancelled.emit();
  }

  // Escape cancels (unless busy, same as the Cancel button itself); Tab/
  // Shift+Tab is trapped within the dialog so a keyboard/screen-reader user
  // can never tab out to the (visually hidden-behind-overlay) page behind
  // it — no @angular/cdk dependency needed for a dialog this simple.
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.cardRef()?.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
