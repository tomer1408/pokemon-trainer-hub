import { Component, EventEmitter, Input, Output, computed } from '@angular/core';

export type PolicyType = 'terms' | 'privacy';

// Real Terms of Use / Privacy Policy pages don't exist yet for this project —
// this shows an honest placeholder instead of a dead `<a href="#">` link, so
// the Consent checkbox's links are real and clickable without pretending a
// full legal page exists.
@Component({
  selector: 'app-policy-modal',
  templateUrl: './policy-modal.html',
  styleUrl: './policy-modal.css',
})
export class PolicyModal {
  @Input({ required: true }) type!: PolicyType;
  @Input() isLight = false;
  @Input() isPikachu = false;

  @Output() closed = new EventEmitter<void>();

  protected readonly title = computed(() => (this.type === 'terms' ? 'Terms of Use' : 'Privacy Policy'));

  protected readonly body = computed(() =>
    this.type === 'terms'
      ? 'This is a placeholder for the Terms of Use. A full policy page will be published before launch.'
      : 'This is a placeholder for the Privacy Policy. A full policy page will be published before launch.',
  );

  onClose(): void {
    this.closed.emit();
  }
}
