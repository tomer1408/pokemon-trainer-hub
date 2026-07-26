import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { AccountMenu } from '../account-menu/account-menu';
import { ProfileService } from '../../core/profile';
import { PokemonService } from '../../core/pokemon';
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
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });
  private readonly profile = toSignal(this.profileService.getProfile(), { initialValue: null });
  // Real PokeAPI sprite (Pikachu, #25) — the site's mascot logo icon, not a
  // static/hardcoded image asset.
  protected readonly logoSprite = toSignal(this.pokemonService.getById(25), { initialValue: null });

  protected readonly trainerName = computed(
    () => this.profile()?.trainerName ?? this.authUser()?.name ?? 'Trainer',
  );
  protected readonly trainerEmail = computed(() => this.authUser()?.email ?? '');

  // Primary nav links collapse into a hamburger-triggered dropdown below
  // ~768px (see navbar.css) — this signal only matters at that width.
  protected readonly mobileMenuOpen = signal(false);

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  setDark(): void {
    this.theme.setDark();
  }

  setLight(): void {
    this.theme.setLight();
  }

  setPikachu(): void {
    this.theme.setPikachu();
  }
}
