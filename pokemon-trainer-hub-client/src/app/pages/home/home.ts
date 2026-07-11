import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { getTeamPower, getTeamTier, getTypeSegments, getStrongestMember } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { TeamSwapModal } from '../../shared/team-swap-modal/team-swap-modal';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { dayOfYearPokemonId } from '../../shared/pokemon-of-the-day';

const MAX_TEAM_SIZE = 5;

// Matches Home Loading.dc.html's rotating tips.
const HOME_LOADING_TIPS = [
  'Warming up the arena…',
  'Waking up your Pokémon…',
  'Polishing your gym badges…',
  'Counting your Dream Team…',
];

interface HowStep {
  num: string;
  title: string;
  desc: string;
  type: PokemonTypeName;
}

const HOW_STEPS: HowStep[] = [
  { num: '1', title: 'Explore', desc: 'Find Pokémon using real PokéAPI data', type: 'electric' },
  { num: '2', title: 'Build', desc: 'Choose up to 5 Pokémon for your Dream Team', type: 'grass' },
  { num: '3', title: 'Dream Team', desc: 'Manage, reorder, and improve your Dream Team', type: 'fire' },
];

interface ActionTile {
  title: string;
  desc: string;
  href: string;
  type: PokemonTypeName;
}

const ACTION_TILES: ActionTile[] = [
  { title: 'Explore Pokémon', desc: 'Search by name, type, stats, and abilities', href: '/explorer', type: 'electric' },
  { title: 'My Team', desc: 'Manage, reorder, and improve your Dream Team', href: '/my-team', type: 'grass' },
  { title: 'Battle', desc: 'Test your team in a simplified battle simulation', href: '/battle', type: 'fire' },
  { title: 'Starter Quiz', desc: 'Get Pokémon recommendations based on your trainer style', href: '/starter-quiz', type: 'water' },
  { title: 'AI Trainer Assistant', desc: "Get suggestions about your team's strengths and weaknesses", href: '/ai-assistant', type: 'ice' },
];

@Component({
  selector: 'app-home',
  imports: [RouterLink, PokemonDetailModal, TeamSwapModal, LoadingScreen],
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

  protected readonly loadingTips = HOME_LOADING_TIPS;

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
  // Separate from swapCandidateId — this is the unforced "team has room"
  // compare flow (mode="compare"), never the full-team forced swap above.
  protected readonly compareCandidateId = signal<number | null>(null);
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

  // Most-represented type on the team, reusing the same dual-type-aware
  // segment calculation as the Type Coverage ring (so this can't disagree
  // with it). Ties are broken by the type of the single strongest Pokémon
  // among the tied types, rather than picking an arbitrary one.
  protected readonly topType = computed<string | null>(() => {
    const team = this.team() ?? [];
    if (team.length === 0) return null;
    const segments = getTypeSegments(team);
    const maxPct = Math.max(...segments.map((s) => s.pct));
    const topTypes = segments.filter((s) => s.pct === maxPct).map((s) => s.type);
    if (topTypes.length === 1) return topTypes[0];
    const strongest = getStrongestMember(team.filter((m) => m.types.some((t) => topTypes.includes(t))));
    return strongest?.types.find((t) => topTypes.includes(t)) ?? topTypes[0];
  });

  protected readonly slots = computed(() => {
    const team = this.team() ?? [];
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  protected readonly howSteps = HOW_STEPS;
  protected readonly actionTiles = ACTION_TILES;

  // Drives the "Recommended next step" banner — same team-state logic used
  // to decide the quiz nudge and the empty/growing/complete messaging
  // elsewhere on this page, just consolidated into one CTA instead of
  // several separate banners repeating similar advice.
  protected readonly rec = computed(() => {
    if (!this.hasTeam()) {
      return {
        title: 'Start by adding your first Pokémon',
        subtitle: 'Browse the Explorer and pick a Pokémon that matches your style',
        ctaLabel: 'Explore Pokémon',
        ctaHref: '/explorer',
        iconType: 'grass' as PokemonTypeName,
        showQuiz: this.showQuizNudge(),
      };
    }
    const remaining = MAX_TEAM_SIZE - this.teamCount();
    if (remaining > 0) {
      return {
        title: 'Your team is growing — keep building',
        subtitle: `Add ${remaining} more Pokémon to complete your Dream Team of 5`,
        ctaLabel: 'Continue Building',
        ctaHref: '/explorer',
        iconType: 'electric' as PokemonTypeName,
        showQuiz: this.showQuizNudge(),
      };
    }
    return {
      title: 'Your Dream Team is complete!',
      subtitle: 'Five Pokémon locked in. Ready to test your strategy in battle?',
      ctaLabel: 'Start Battle',
      ctaHref: '/battle',
      iconType: 'fire' as PokemonTypeName,
      showQuiz: false,
    };
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

  // Modal already confirmed with the user before emitting this.
  removeFromTeamModal(pokemonId: number): void {
    this.teamService.removeFromTeam(pokemonId).subscribe(() => {
      this.teamRefresh.update((n) => n + 1);
      this.closeDetail();
    });
  }

  closeSwap(): void {
    this.swapCandidateId.set(null);
  }

  // 'compare' mode — team has room, so this never forces a swap; the swap
  // modal's own confirmAdd() is what actually calls teamService.addToTeam().
  onCompareWithTeam(pokemonId: number): void {
    this.compareCandidateId.set(pokemonId);
  }

  closeCompareWithTeam(): void {
    this.compareCandidateId.set(null);
  }

  onCompareAdded(): void {
    this.teamRefresh.update((n) => n + 1);
    this.compareCandidateId.set(null);
    this.closeDetail();
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
