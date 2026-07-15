import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, map, switchMap } from 'rxjs';
import { PokemonService, PokemonListResponse, PokemonSummary } from '../../core/pokemon';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { ProfileService } from '../../core/profile';
import { getTeamPower } from '../../shared/team-power';
import { POKEMON_TYPES, TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { TeamSwapModal } from '../../shared/team-swap-modal/team-swap-modal';
import { PokemonCompareModal } from '../../shared/pokemon-compare-modal/pokemon-compare-modal';
import { PotdCard } from '../../shared/potd-card/potd-card';
import { dayOfYearPokemonId } from '../../shared/pokemon-of-the-day';

type SortBy = 'name' | 'dex';

const PAGE_SIZE = 4;
const MAX_TEAM_SIZE = 5;
const EMPTY_LIST: PokemonListResponse = { results: [], page: 1, pageSize: PAGE_SIZE, total: 0 };

function matchesFavorite(fav: FavoritePokemon, search: string, type: string): boolean {
  if (search && !fav.pokemonName.toLowerCase().includes(search.toLowerCase())) return false;
  if (type !== 'all' && !fav.types.includes(type)) return false;
  return true;
}

function sortSummaries(list: PokemonSummary[], sort: SortBy): PokemonSummary[] {
  const copy = [...list];
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name));
  return copy.sort((a, b) => a.id - b.id);
}

@Component({
  selector: 'app-explorer',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, PokemonDetailModal, TeamSwapModal, PokemonCompareModal, PotdCard],
  templateUrl: './explorer.html',
  styleUrl: './explorer.css',
})
export class Explorer {
  private readonly pokemonService = inject(PokemonService);
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly profileService = inject(ProfileService);
  protected readonly theme = inject(ThemeService);

  protected readonly types = POKEMON_TYPES;

  private readonly profile = toSignal(this.profileService.getProfile(), { initialValue: null });
  protected readonly teamName = computed(() => this.profile()?.teamName || 'Your Team');

  protected readonly potd = toSignal(this.pokemonService.getById(dayOfYearPokemonId()), {
    initialValue: null,
  });

  protected readonly searchInput = signal('');
  private readonly debouncedSearch = toSignal(
    toObservable(this.searchInput).pipe(debounceTime(300)),
    { initialValue: '' },
  );

  protected readonly typeFilter = signal<PokemonTypeName | 'all'>('all');
  protected readonly sortBy = signal<SortBy>('name');
  protected readonly favoritesOnly = signal(false);
  protected readonly page = signal(1);
  protected readonly surpriseId = signal<number | null>(null);
  protected readonly mobileDrawerOpen = signal(false);
  protected readonly pendingRemove = signal<{ id: number; name: string } | null>(null);
  protected readonly swapNotice = signal<string | null>(null);
  protected readonly selectedPokemon = signal<PokemonSummary | null>(null);
  protected readonly swapCandidate = signal<PokemonSummary | null>(null);
  // Separate from swapCandidate — this is the unforced "team has room"
  // compare flow (mode="compare"), never the full-team forced swap above.
  protected readonly compareCandidate = signal<PokemonSummary | null>(null);

  // Explorer's own standalone "compare any two" tool — independent of the
  // team-focused compareCandidate/swapCandidate above and of Manage My
  // Team's own "⇄ Compare". Picking a first Pokémon stages it in
  // compareSlotA; picking a second immediately opens the comparison modal.
  protected readonly compareSlotA = signal<PokemonSummary | null>(null);
  protected readonly compareSlotB = signal<PokemonSummary | null>(null);

  private readonly teamRefresh = signal(0);
  private readonly favoritesRefresh = signal(0);

  protected readonly team = toSignal(
    toObservable(this.teamRefresh).pipe(switchMap(() => this.teamService.getTeam())),
    { initialValue: [] as DreamTeamMember[] },
  );

  protected readonly favorites = toSignal(
    toObservable(this.favoritesRefresh).pipe(switchMap(() => this.favoritesService.getFavorites())),
    { initialValue: [] as FavoritePokemon[] },
  );

  private readonly query = computed(() => ({
    search: this.debouncedSearch(),
    type: this.typeFilter(),
    sort: this.sortBy(),
    page: this.page(),
    favoritesOnly: this.favoritesOnly(),
  }));

  // Resets to page 1 whenever a filter (not the page itself) changes.
  private readonly resetPageOnFilterChange = effect(() => {
    this.debouncedSearch();
    this.typeFilter();
    this.sortBy();
    this.favoritesOnly();
    this.page.set(1);
  });

  protected readonly isLoading = signal(false);

  protected readonly listResult = toSignal(
    toObservable(this.query).pipe(
      switchMap((q) => {
        this.isLoading.set(true);
        if (q.favoritesOnly) {
          return this.favoritesService.getFavorites().pipe(
            map((favs): PokemonListResponse => {
              const filtered = favs.filter((f) => matchesFavorite(f, q.search, q.type));
              const results: PokemonSummary[] = sortSummaries(
                filtered.map((f) => ({
                  id: f.pokemonId,
                  name: f.pokemonName,
                  baseExperience: f.baseExperience,
                  types: f.types,
                  spriteUrl: f.spriteUrl,
                  stats: f.stats,
                })),
                q.sort,
              );
              return { results, page: 1, pageSize: results.length || 1, total: results.length };
            }),
          );
        }
        return this.pokemonService.search({
          search: q.search || undefined,
          type: q.type === 'all' ? undefined : q.type,
          sort: q.sort === 'dex' ? 'id' : 'name',
          page: q.page,
        });
      }),
    ),
    { initialValue: EMPTY_LIST },
  );

  constructor() {
    effect(() => {
      this.listResult();
      this.isLoading.set(false);
    });
  }

  protected readonly totalPages = computed(() =>
    this.favoritesOnly() ? 1 : Math.max(1, Math.ceil(this.listResult().total / PAGE_SIZE)),
  );
  protected readonly isFirstPage = computed(() => this.page() <= 1);
  protected readonly isLastPage = computed(() => this.page() >= this.totalPages());

  protected readonly teamPower = computed(() => getTeamPower(this.team()));
  protected readonly teamFull = computed(() => this.team().length >= MAX_TEAM_SIZE);
  protected readonly hasTeam = computed(() => this.team().length > 0);
  protected readonly teamCoverage = computed(() => {
    const types = new Set<string>();
    this.team().forEach((m) => m.types.forEach((t) => types.add(t)));
    return Array.from(types);
  });
  protected readonly teamSlots = computed(() => {
    const team = this.team();
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  isOnTeam(pokemonId: number): boolean {
    return this.team().some((m) => m.pokemonId === pokemonId);
  }

  isFavorite(pokemonId: number): boolean {
    return this.favorites().some((f) => f.pokemonId === pokemonId);
  }

  isComparing(pokemonId: number): boolean {
    return this.compareSlotA()?.id === pokemonId || this.compareSlotB()?.id === pokemonId;
  }

  selectType(type: PokemonTypeName | 'all'): void {
    this.typeFilter.set(this.typeFilter() === type ? 'all' : type);
  }

  toggleFavoritesOnly(): void {
    this.favoritesOnly.update((v) => !v);
  }

  toggleFavorite(p: PokemonSummary): void {
    const obs = this.isFavorite(p.id)
      ? this.favoritesService.removeFavorite(p.id)
      : this.favoritesService.addFavorite(p.id);
    obs.subscribe(() => this.favoritesRefresh.update((n) => n + 1));
  }

  actionLabel(p: PokemonSummary): string {
    if (this.isOnTeam(p.id)) return 'Remove';
    if (this.teamFull()) return 'Compare';
    return 'Add to Team';
  }

  onAction(p: PokemonSummary): void {
    if (this.isOnTeam(p.id)) {
      // Reuses the same confirm dialog/flow the team sidebar's × button
      // already uses — pendingRemove just needs {id, name}, not a full
      // DreamTeamMember, so it's set directly here instead of via
      // requestRemove().
      this.pendingRemove.set({ id: p.id, name: p.name });
      return;
    }

    if (this.teamFull()) {
      this.swapCandidate.set(p);
      return;
    }

    this.teamService.addToTeam(p.id).subscribe((result) => {
      if (result.ok) {
        this.teamRefresh.update((n) => n + 1);
        this.swapNotice.set(null);
        // Only close on a real success — TEAM_FULL/duplicate/error below all
        // leave the modal open so the user can see the message or continue
        // into the swap flow.
        this.closeDetail();
      } else if (result.reason === 'TEAM_FULL') {
        this.swapCandidate.set(p);
      } else {
        this.swapNotice.set(result.message);
      }
    });
  }

  closeSwap(): void {
    this.swapCandidate.set(null);
  }

  onSwapped(): void {
    this.teamRefresh.update((n) => n + 1);
    this.swapCandidate.set(null);
  }

  // 'compare' mode — team has room, so this never forces a swap; the swap
  // modal's own confirmAdd() is what actually calls teamService.addToTeam().
  onCompareWithTeam(p: PokemonSummary): void {
    this.compareCandidate.set(p);
  }

  closeCompareWithTeam(): void {
    this.compareCandidate.set(null);
  }

  onCompareAdded(): void {
    this.teamRefresh.update((n) => n + 1);
    this.compareCandidate.set(null);
    this.closeDetail();
  }

  // 'compare' mode also allows swapping in the picked teammate (team has
  // room, so this is optional — unlike 'overflow', where it's the only way).
  onCompareSwapped(): void {
    this.teamRefresh.update((n) => n + 1);
    this.compareCandidate.set(null);
    this.closeDetail();
  }

  // Toggling the same Pokémon again clears its own slot; picking a second,
  // different Pokémon while slot A is already filled opens the modal.
  toggleCompareSlot(p: PokemonSummary): void {
    const a = this.compareSlotA();
    const b = this.compareSlotB();
    if (a?.id === p.id) {
      this.compareSlotA.set(null);
      return;
    }
    if (b?.id === p.id) {
      this.compareSlotB.set(null);
      return;
    }
    if (!a) {
      this.compareSlotA.set(p);
    } else if (!b) {
      this.compareSlotB.set(p);
    }
  }

  // Lets a Dream Team member (shown in the sidebar, not the search grid) be
  // picked into the same compareSlotA/B tool — same toggle logic, just fed
  // from a DreamTeamMember's shape instead of a search result's.
  toggleCompareSlotFromTeam(member: DreamTeamMember): void {
    this.toggleCompareSlot({
      id: member.pokemonId,
      name: member.pokemonName,
      baseExperience: member.baseExperience,
      types: member.types,
      spriteUrl: member.spriteUrl,
      stats: member.stats,
    });
  }

  cancelCompareSelection(): void {
    this.compareSlotA.set(null);
    this.compareSlotB.set(null);
  }

  closeCompareModal(): void {
    this.compareSlotA.set(null);
    this.compareSlotB.set(null);
  }

  requestRemove(member: DreamTeamMember): void {
    this.pendingRemove.set({ id: member.pokemonId, name: member.pokemonName });
  }

  confirmRemove(): void {
    const target = this.pendingRemove();
    if (!target) return;
    this.teamService.removeFromTeam(target.id).subscribe(() => {
      this.teamRefresh.update((n) => n + 1);
      this.pendingRemove.set(null);
    });
  }

  // Modal already confirmed with the user before emitting this.
  removeFromTeamModal(pokemonId: number): void {
    this.teamService.removeFromTeam(pokemonId).subscribe(() => {
      this.teamRefresh.update((n) => n + 1);
      this.closeDetail();
    });
  }

  cancelRemove(): void {
    this.pendingRemove.set(null);
  }

  clearFilters(): void {
    this.searchInput.set('');
    this.typeFilter.set('all');
    this.favoritesOnly.set(false);
    this.page.set(1);
  }

  prevPage(): void {
    this.page.update((p) => Math.max(1, p - 1));
  }

  nextPage(): void {
    this.page.update((p) => Math.min(this.totalPages(), p + 1));
  }

  // Picks a real random Pokémon (original 151, so the id is always valid) and
  // puts its name straight into search — guarantees it's actually visible in
  // the results (unlike highlighting a card that may be off-page).
  onSurpriseMe(): void {
    const randomId = Math.floor(Math.random() * 151) + 1;
    this.pokemonService.getById(randomId).subscribe((p) => {
      if (!p) return;
      this.favoritesOnly.set(false);
      this.typeFilter.set('all');
      this.searchInput.set(p.name);
      this.surpriseId.set(p.id);
      setTimeout(() => this.surpriseId.set(null), 2800);
    });
  }

  openDetail(p: PokemonSummary): void {
    this.selectedPokemon.set(p);
  }

  closeDetail(): void {
    this.selectedPokemon.set(null);
  }

  toggleMobileDrawer(): void {
    this.mobileDrawerOpen.update((v) => !v);
  }

  closeMobileDrawer(): void {
    this.mobileDrawerOpen.set(false);
  }
}
