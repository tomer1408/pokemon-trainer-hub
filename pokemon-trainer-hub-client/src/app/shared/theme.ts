import { Injectable, computed, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light' | 'pikachu';

// Single source of truth for theme, shared by the Navbar's toggle and every
// page — so switching theme doesn't reset when you navigate.
//
// isLight/isPikachu are computed from `mode` (not separate signals) so pages
// not yet updated for Pikachu Mode degrade safely: they only ever check
// isLight(), which is simply false while mode is 'pikachu' — they keep
// rendering their existing dark styling instead of breaking.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('dark');

  readonly isLight = computed(() => this.mode() === 'light');
  readonly isPikachu = computed(() => this.mode() === 'pikachu');

  setDark(): void {
    this.mode.set('dark');
  }

  setLight(): void {
    this.mode.set('light');
  }

  setPikachu(): void {
    this.mode.set('pikachu');
  }
}
