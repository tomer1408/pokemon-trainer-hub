import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { ProfileService } from '../../core/profile';
import { TeamService } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { getTeamPower, getTeamTier } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { TeamSwapModal } from '../../shared/team-swap-modal/team-swap-modal';

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
  imports: [RouterLink, PokemonDetailModal, TeamSwapModal],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });
  protected readonly profile = toSignal(this.profileService.getProfile(), { initialValue: null });
  protected readonly trainerName = computed(
    () => this.profile()?.trainerName ?? this.authUser()?.name ?? 'Trainer',
  );
  protected readonly trainerInitial = computed(() => this.trainerName().charAt(0).toUpperCase());

  private readonly avatarPokemonId = computed(() => this.profile()?.avatarPokemonId ?? null);
  protected readonly avatarSprite = toSignal(
    toObservable(this.avatarPokemonId).pipe(
      switchMap((id) => (id == null ? of(null) : this.pokemonService.getById(id))),
      map((p) => p?.spriteUrl ?? null),
    ),
    { initialValue: null as string | null },
  );

  protected readonly selectedPokemonId = signal<number | null>(null);
  protected readonly swapCandidateId = signal<number | null>(null);
  private readonly teamRefresh = signal(0);
  private readonly favoritesRefresh = signal(0);

  // undefined (not yet loaded) is distinguished from [] (loaded, empty team)
  // so the page can show a loading skeleton for the trainer card/team strip.
  protected readonly team = toSignal(
    toObservable(this.teamRefresh).pipe(switchMap(() => this.teamService.getTeam())),
  );
  protected readonly isLoading = computed(() => this.team() === undefined);

  protected readonly favorites = toSignal(
    toObservable(this.favoritesRefresh).pipe(switchMap(() => this.favoritesService.getFavorites())),
    { initialValue: [] as FavoritePokemon[] },
  );

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

  protected readonly teamFull = computed(() => this.teamCount() >= MAX_TEAM_SIZE);

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  isOnTeam(pokemonId: number): boolean {
    return (this.team() ?? []).some((m) => m.pokemonId === pokemonId);
  }

  isFavorite(pokemonId: number): boolean {
    return this.favorites().some((f) => f.pokemonId === pokemonId);
  }

  toggleFavorite(pokemonId: number): void {
    const obs = this.isFavorite(pokemonId)
      ? this.favoritesService.removeFavorite(pokemonId)
      : this.favoritesService.addFavorite(pokemonId);
    obs.subscribe(() => this.favoritesRefresh.update((n) => n + 1));
  }

  addToTeam(pokemonId: number): void {
    if (this.isOnTeam(pokemonId)) return;
    if (this.teamFull()) {
      this.swapCandidateId.set(pokemonId);
      return;
    }
    this.teamService.addToTeam(pokemonId).subscribe((result) => {
      if (result.ok) this.teamRefresh.update((n) => n + 1);
      else if (result.reason === 'TEAM_FULL') this.swapCandidateId.set(pokemonId);
    });
  }

  openDetail(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
  }

  closeDetail(): void {
    this.selectedPokemonId.set(null);
  }

  closeSwap(): void {
    this.swapCandidateId.set(null);
  }

  onSwapped(): void {
    this.teamRefresh.update((n) => n + 1);
    this.swapCandidateId.set(null);
  }

  acceptCookies(): void {
    this.cookieChoice.set('accepted');
  }

  declineCookies(): void {
    this.cookieChoice.set('declined');
  }
}
