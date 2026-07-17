import { Component, computed, input, output, signal } from '@angular/core';

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
}
