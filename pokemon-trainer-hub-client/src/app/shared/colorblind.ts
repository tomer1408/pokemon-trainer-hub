import { Injectable, effect, signal } from '@angular/core';

export type ColorblindMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';

// Shared between Account Menu's quick picker and the Settings page's own —
// same real modes, same labels, one place to define them.
export const COLORBLIND_MODE_OPTIONS: { value: ColorblindMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'protanopia', label: 'Protanopia' },
  { value: 'deuteranopia', label: 'Deuteranopia' },
  { value: 'tritanopia', label: 'Tritanopia' },
];

// Single source of truth for Colorblind Mode, applied globally by filtering
// the whole rendered page (document.body) rather than a single component —
// so it covers every page, modal, and overlay without each one having to
// know about it. The actual filters are SVG feColorMatrix defs declared
// once in index.html (id="cvd-<mode>"); this service just toggles which one
// is active.
@Injectable({ providedIn: 'root' })
export class ColorblindService {
  readonly mode = signal<ColorblindMode>('off');

  constructor() {
    effect(() => {
      const mode = this.mode();
      document.body.style.filter = mode === 'off' ? '' : `url(#cvd-${mode})`;
    });
  }

  setMode(mode: ColorblindMode): void {
    this.mode.set(mode);
  }
}
