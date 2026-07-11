import { AfterViewInit, Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { ProfileService } from '../../core/profile';
import { getStrongestMember, getTeamPower, getTeamTier, getTypeSegments } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { TeamNameGeneratorModal } from '../../shared/team-name-generator-modal/team-name-generator-modal';

const MAX_TEAM_SIZE = 5;

@Component({
  selector: 'app-my-team',
  imports: [RouterLink, PokemonDetailModal, LoadingScreen, TeamNameGeneratorModal],
  templateUrl: './my-team.html',
  styleUrl: './my-team.css',
})
export class MyTeam implements AfterViewInit {
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly profileService = inject(ProfileService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  protected readonly theme = inject(ThemeService);

  private readonly profileRefresh = signal(0);
  private readonly profile = toSignal(
    toObservable(this.profileRefresh).pipe(switchMap(() => this.profileService.getProfile())),
    { initialValue: null },
  );
  protected readonly teamName = computed(() => this.profile()?.teamName || 'My Team');

  protected readonly showNameGenerator = signal(false);
  protected readonly savingName = signal(false);
  protected readonly nameSaveError = signal<string | null>(null);

  // The page must never scroll — measures exactly how much viewport space is
  // left below the (real, live) navbar instead of guessing its height in
  // CSS, and pins the page to precisely that.
  protected readonly pageHeightPx = signal<number | null>(null);

  protected readonly selectedPokemonId = signal<number | null>(null);
  private readonly teamRefresh = signal(0);
  private readonly favoritesRefresh = signal(0);

  // Uses getTeamStrict() (unlike Explorer/Home's old getTeam() calls)
  // so a genuine request failure can be told apart from a real empty team —
  // otherwise both look identical to the user.
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
  protected readonly hasError = computed(() => this.teamResult()?.ok === false);

  protected readonly favorites = toSignal(
    toObservable(this.favoritesRefresh).pipe(switchMap(() => this.favoritesService.getFavorites())),
    { initialValue: [] as FavoritePokemon[] },
  );

  protected readonly isLoading = computed(() => this.teamResult() === undefined);

  constructor() {
    // Loading → loaded swaps in very different content heights, but the
    // component's own position right after the navbar doesn't move — still
    // worth a re-measure in case web fonts finish swapping in around the
    // same time and nudge the navbar's height.
    effect(() => {
      this.isLoading();
      setTimeout(() => this.measurePageHeight(), 0);
    });
  }

  ngAfterViewInit(): void {
    this.measurePageHeight();
  }

  @HostListener('window:resize')
  protected measurePageHeight(): void {
    const top = this.elementRef.nativeElement.getBoundingClientRect().top;
    this.pageHeightPx.set(window.innerHeight - top);
  }

  protected readonly teamCount = computed(() => this.team()?.length ?? 0);
  protected readonly hasTeam = computed(() => this.teamCount() > 0);

  protected readonly slots = computed(() => {
    const team = this.team() ?? [];
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  protected readonly tier = computed(() => getTeamTier(this.teamCount()));
  protected readonly totalPower = computed(() => getTeamPower(this.team() ?? []));
  protected readonly averagePower = computed(() =>
    this.hasTeam() ? Math.round(this.totalPower() / this.teamCount()) : 0,
  );
  protected readonly strongest = computed(() => getStrongestMember(this.team() ?? []));

  protected readonly maxMemberPower = computed(() =>
    Math.max(1, ...(this.team() ?? []).map((m) => m.baseExperience)),
  );
  protected readonly breakdownRows = computed(() =>
    [...(this.team() ?? [])].sort((a, b) => b.baseExperience - a.baseExperience),
  );

  // Dual-type Pokémon count toward BOTH types, normalized so the segments sum
  // to 100% — per the product spec (not the mockup's fake single-type data).
  // Shared with Home's type-coverage card so both use the exact same calculation.
  protected readonly typeSegments = computed(() => getTypeSegments(this.team() ?? []));

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
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

  openDetail(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
  }

  closeDetail(): void {
    this.selectedPokemonId.set(null);
  }

  // Modal already confirmed with the user before emitting this — same
  // real DELETE /api/team/:id endpoint Explorer/Manage Team already use.
  removeFromTeamModal(pokemonId: number): void {
    this.teamService.removeFromTeam(pokemonId).subscribe(() => {
      this.teamRefresh.update((n) => n + 1);
      this.closeDetail();
    });
  }

  retry(): void {
    this.teamRefresh.update((n) => n + 1);
  }

  openNameGenerator(): void {
    this.nameSaveError.set(null);
    this.showNameGenerator.set(true);
  }

  closeNameGenerator(): void {
    this.showNameGenerator.set(false);
  }

  // "Use This Name" saves immediately — My Team has no draft/Save bar of
  // its own for this field (unlike Onboarding/Profile edit), so the AI
  // suggestion has to be persisted right away via ProfileService's
  // lightweight PATCH, not just held in local state.
  onNameSelected(name: string): void {
    this.savingName.set(true);
    this.nameSaveError.set(null);

    this.profileService.updateTeamName(name).subscribe((result) => {
      this.savingName.set(false);
      if (result.ok) {
        this.profileRefresh.update((n) => n + 1);
        this.showNameGenerator.set(false);
      } else {
        this.nameSaveError.set(result.message);
      }
    });
  }
}
