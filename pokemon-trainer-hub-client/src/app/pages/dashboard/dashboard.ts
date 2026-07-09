import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { ProfileService } from '../../core/profile';
import { TeamService } from '../../core/team';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { getTeamPower, getTeamTier } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';

const MAX_TEAM_SIZE = 5;

// Deterministic "Pokémon of the Day" — same real Pokémon for everyone all day
// (day-of-year mod 151, the original 151 so the id is always guaranteed valid),
// changing at midnight. Real PokeAPI data, not a mockup placeholder.
function dayOfYearPokemonId(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return (dayOfYear % 151) + 1;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly teamService = inject(TeamService);
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });
  protected readonly profile = toSignal(this.profileService.getProfile(), { initialValue: null });
  protected readonly trainerName = computed(
    () => this.profile()?.trainerName ?? this.authUser()?.name ?? 'Trainer',
  );
  protected readonly trainerInitial = computed(() => this.trainerName().charAt(0).toUpperCase());

  // undefined (not yet loaded) is distinguished from [] (loaded, empty team)
  // so the page can show a loading skeleton for the trainer card/team strip.
  protected readonly team = toSignal(this.teamService.getTeam());
  protected readonly isLoading = computed(() => this.team() === undefined);

  protected readonly teamCount = computed(() => this.team()?.length ?? 0);
  protected readonly teamPower = computed(() => getTeamPower(this.team() ?? []));
  protected readonly tier = computed(() => getTeamTier(this.teamCount()));
  protected readonly hasTeam = computed(() => this.teamCount() > 0);

  protected readonly pips = computed(() =>
    Array.from({ length: MAX_TEAM_SIZE }, (_, i) => i < this.teamCount()),
  );

  protected readonly slots = computed(() => {
    const team = this.team() ?? [];
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  protected readonly potd = toSignal(this.pokemonService.getById(dayOfYearPokemonId()), {
    initialValue: null,
  });

  // 20 real, currently-lowest-numbered Pokémon, used to scroll real sprites
  // across the marquee strip instead of the mockup's decorative placeholders.
  protected readonly marqueeTiles = toSignal(this.pokemonService.search({ sort: 'id', page: 1 }), {
    initialValue: { results: [] as PokemonSummary[], page: 1, pageSize: 20, total: 0 },
  });

  protected readonly cookieChoice = signal<'accepted' | 'declined' | null>(null);

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  acceptCookies(): void {
    this.cookieChoice.set('accepted');
  }

  declineCookies(): void {
    this.cookieChoice.set('declined');
  }
}
