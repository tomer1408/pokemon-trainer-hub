import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { AccountMenu, ColorblindMode } from '../account-menu/account-menu';
import { ProfileService } from '../../core/profile';
import { ThemeService } from '../theme';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, AccountMenu],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  protected readonly theme = inject(ThemeService);

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });
  private readonly profile = toSignal(this.profileService.getProfile(), { initialValue: null });

  protected readonly trainerName = computed(
    () => this.profile()?.trainerName ?? this.authUser()?.name ?? 'Trainer',
  );
  protected readonly trainerEmail = computed(() => this.authUser()?.email ?? '');

  protected readonly colorblindMode = signal<ColorblindMode>('off');

  setDark(): void {
    this.theme.setDark();
  }

  setLight(): void {
    this.theme.setLight();
  }

  logout(): void {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
