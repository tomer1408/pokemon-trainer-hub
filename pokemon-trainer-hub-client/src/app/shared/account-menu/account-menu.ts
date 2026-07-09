import { Component, computed, inject, input, model, signal } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';

export type ColorblindMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';

const COLORBLIND_MODES: { value: ColorblindMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'protanopia', label: 'Protanopia' },
  { value: 'deuteranopia', label: 'Deuteranopia' },
  { value: 'tritanopia', label: 'Tritanopia' },
];

@Component({
  selector: 'app-account-menu',
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.css',
})
export class AccountMenu {
  private readonly auth = inject(AuthService);

  readonly trainerName = input('Trainer');
  readonly email = input('');
  readonly isLight = input(false);
  readonly colorblindMode = model<ColorblindMode>('off');

  protected readonly colorblindModes = COLORBLIND_MODES;
  protected readonly initial = computed(() => this.trainerName().charAt(0).toUpperCase() || 'T');

  protected readonly open = signal(false);

  toggleOpen(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  setColorblindMode(mode: ColorblindMode): void {
    this.colorblindMode.set(mode);
  }

  logout(): void {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }
}
