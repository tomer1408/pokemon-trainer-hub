import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { getTeamPower, getTeamTier, getTypeSegments } from '../../shared/team-power';
import { POKEMON_TYPES, TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { TeamSwapModal } from '../../shared/team-swap-modal/team-swap-modal';
import { dayOfYearPokemonId } from '../../shared/pokemon-of-the-day';

const MAX_TEAM_SIZE = 5;

function relativeTime(atMs: number): string {
  const diffMs = Date.now() - atMs;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, PokemonDetailModal, TeamSwapModal],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });

  private readonly profileRefresh = signal(0);
  // 404 (no profile yet) is a normal, non-error outcome — only a genuine
  // request failure (network/500/etc.) should trip the error state below.
  private readonly profileResult = toSignal(
    toObservable(this.profileRefresh).pipe(
      switchMap(() =>
        this.profileService.getProfileStrict().pipe(
          map((profile) => ({ ok: true as const, profile: profile as TrainerProfile | null })),
          catchError((err) =>
            of({ ok: err?.status === 404, profile: null as TrainerProfile | null }),
          ),
        ),
      ),
    ),
    { initialValue: { ok: true as const, profile: null as TrainerProfile | null } },
  );
  protected readonly profile = computed(() => this.profileResult().profile);
  private readonly profileErrored = computed(() => !this.profileResult().ok);

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
  // Unlike getTeam() elsewhere, getTeamStrict() doesn't swallow errors — a
  // genuine request failure is captured here instead of silently rendering
  // as an empty team.
  private readonly teamResult = toSignal(
    toObservable(this.teamRefresh).pipe(
      switchMap(() =>
        this.teamService.getTeamStrict().pipe(
          map((team) => ({ ok: true, team })),
          catchError(() => of({ ok: false, team: [] as DreamTeamMember[] })),
        ),
      ),
    ),
  );
  protected readonly team = computed(() => this.teamResult()?.team);
  private readonly teamErrored = computed(() => this.teamResult()?.ok === false);

  protected readonly isLoading = computed(() => this.teamResult() === undefined);
  protected readonly hasError = computed(() => this.profileErrored() || this.teamErrored());

  protected readonly favorites = toSignal(
    toObservable(this.favoritesRefresh).pipe(switchMap(() => this.favoritesService.getFavorites())),
    { initialValue: [] as FavoritePokemon[] },
  );

  protected readonly teamCount = computed(() => this.team()?.length ?? 0);
  protected readonly teamPower = computed(() => getTeamPower(this.team() ?? []));
  protected readonly tier = computed(() => getTeamTier(this.teamCount()));
  protected readonly hasTeam = computed(() => this.teamCount() > 0);
  protected readonly favoritesCount = computed(() => this.favorites().length);

  // Real stand-in for the mockup's "win rate" ring — this app has no battle
  // engine to generate a real win rate from, but type coverage is a genuine,
  // already-tracked number that fits the same "ring + percentage" shape.
  protected readonly typeCoveragePct = computed(() => {
    const present = new Set(getTypeSegments(this.team() ?? []).map((s) => s.type));
    return Math.round((present.size / POKEMON_TYPES.length) * 100);
  });

  protected readonly pips = computed(() =>
    Array.from({ length: MAX_TEAM_SIZE }, (_, i) => i < this.teamCount()),
  );

  protected readonly slots = computed(() => {
    const team = this.team() ?? [];
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  // Recent Activity, built from real addedAt timestamps (team joins +
  // favorites) instead of a simulated event log this app doesn't have.
  protected readonly recentActivity = computed(() => {
    const teamEvents = (this.team() ?? []).map((m) => ({
      title: `Added ${m.pokemonName} to your team`,
      at: new Date(m.addedAt).getTime(),
    }));
    const favoriteEvents = this.favorites().map((f) => ({
      title: `Favorited ${f.pokemonName}`,
      at: new Date(f.addedAt).getTime(),
    }));
    return [...teamEvents, ...favoriteEvents]
      .sort((a, b) => b.at - a.at)
      .slice(0, 4)
      .map((ev) => ({ title: ev.title, time: relativeTime(ev.at) }));
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

  // Real, server-side flag (not client storage) — stays visible on every
  // Home visit until the trainer actually completes the quiz, skipping only
  // defers the redirect guard, not this nudge.
  protected readonly showQuizNudge = computed(
    () => this.profile()?.hasCompletedStarterQuiz === false,
  );

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
      if (result.ok) {
        this.teamRefresh.update((n) => n + 1);
        // Only close on a real success — TEAM_FULL/error below leave the
        // modal open so the user can see the message or continue into the
        // swap flow.
        this.closeDetail();
      } else if (result.reason === 'TEAM_FULL') {
        this.swapCandidateId.set(pokemonId);
      }
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

  retry(): void {
    this.profileRefresh.update((n) => n + 1);
    this.teamRefresh.update((n) => n + 1);
  }

  acceptCookies(): void {
    this.cookieChoice.set('accepted');
  }

  declineCookies(): void {
    this.cookieChoice.set('declined');
  }
}
