import { Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { ColorblindService, ColorblindMode, COLORBLIND_MODE_OPTIONS } from '../colorblind';
import { clearStarterQuizSkip } from '../quiz/quiz-completion';

@Component({
  selector: 'app-account-menu',
  imports: [RouterLink],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.css',
})
export class AccountMenu {
  private readonly auth = inject(AuthService);
  protected readonly colorblind = inject(ColorblindService);

  readonly trainerName = input('Trainer');
  readonly email = input('');
  readonly isLight = input(false);
  readonly isPikachu = input(false);

  protected readonly colorblindModes = COLORBLIND_MODE_OPTIONS;
  protected readonly initial = computed(() => this.trainerName().charAt(0).toUpperCase() || 'T');

  protected readonly open = signal(false);

  toggleOpen(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  // The scrim already closes on an outside click — this covers the keyboard
  // path, which is the one piece of expected dropdown behavior that wasn't
  // there before.
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  setColorblindMode(mode: ColorblindMode): void {
    this.colorblind.setMode(mode);
  }

  logout(): void {
    clearStarterQuizSkip();
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }
}
