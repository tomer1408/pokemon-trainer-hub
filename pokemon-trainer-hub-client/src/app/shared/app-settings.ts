import { Injectable, signal } from '@angular/core';

// Holds cross-page app preferences that (like ThemeService/ColorblindService)
// are real in-memory state, not localStorage or a backend field — consistent
// with how the rest of the app's preferences behave today (reset on reload).
//
// battleExplanationsDefault only seeds a new Battle session's own settings
// panel (BattleSettings.showExplanations) — it deliberately does NOT force
// every battle to use it, since Battle already lets you override this
// per-session right there. This avoids two controls fighting over the same
// state; Settings only sets what a fresh session starts with.
@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  readonly battleExplanationsDefault = signal(true);

  setBattleExplanationsDefault(value: boolean): void {
    this.battleExplanationsDefault.set(value);
  }
}
