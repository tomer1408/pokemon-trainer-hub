import { Injectable, signal } from '@angular/core';

// Single source of truth for dark/light mode, shared by the Navbar's toggle
// and every page — so switching theme doesn't reset when you navigate.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isLight = signal(false);

  setDark(): void {
    this.isLight.set(false);
  }

  setLight(): void {
    this.isLight.set(true);
  }
}
