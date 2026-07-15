import { Component, HostListener, input, signal } from '@angular/core';

// A small "ⓘ" button that reveals an explanation on click — same
// open/scrim/Escape interaction pattern as account-menu's dropdown, just
// for a short piece of text instead of a full menu. Native `title` tooltips
// don't work reliably on click/touch/keyboard focus, which is why this
// exists instead of just a `title` attribute.
@Component({
  selector: 'app-info-tooltip',
  templateUrl: './info-tooltip.html',
  styleUrl: './info-tooltip.css',
})
export class InfoTooltip {
  readonly text = input.required<string>();
  readonly label = input('More info');
  readonly isLight = input(false);
  readonly isPikachu = input(false);

  protected readonly open = signal(false);

  toggleOpen(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }
}
