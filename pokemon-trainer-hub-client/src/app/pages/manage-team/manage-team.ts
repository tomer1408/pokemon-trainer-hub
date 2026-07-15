import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, forkJoin, map, of } from 'rxjs';
import { TeamService } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { getTeamPower, getTypeSegments } from '../../shared/team-power';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { TeamSwapModal, ComparablePokemon, SwapMode } from '../../shared/team-swap-modal/team-swap-modal';
import { InfoTooltip } from '../../shared/info-tooltip/info-tooltip';

const MAX_TEAM_SIZE = 5;

const MANAGE_TEAM_LOADING_TIPS = [
  'Rearranging your roster…',
  'Checking bench strength…',
  'Syncing team slots…',
  'Polishing team badges…',
];

type DragSource = 'team' | 'fav' | 'bench';
interface DragState {
  item: ComparablePokemon;
  from: DragSource;
}

// This page follows a savedState / draftState pattern, and — deliberately,
// unlike every other page in the app — NOTHING here reaches the backend
// immediately, not even a confirmed trash removal, a Compare/Swap pick, or a
// favorite toggle. Everything is staged into draft state; only Save Changes
// commits anything real. This is what makes Revert genuinely restore the
// exact team (and favorites) the trainer had before this visit, no matter
// how many confirmed edits happened in between:
//   - savedTeam / savedFavorites = the last state actually confirmed by the
//     backend (set once on load, and again only after a successful Save).
//   - teamDraft / allFavorites   = the local, in-progress state the user is
//     editing. Nothing here is real until Save Changes.
// hasUnsavedChanges() compares teamDraft against savedTeam by ORDERED
// pokemonId arrays (so a pure reorder is detected the same way as an add/
// remove) and allFavorites against savedFavorites by unordered id set
// (favorites have no meaningful order).
//
// The Bench is purely client-side and is never sent to the backend at all.
// The "Compare" action on a team slot / favorite card opens the shared
// TeamSwapModal with persistImmediately=false — it only ever reports the
// pick back to this page's draft state, never touches the real swap
// endpoint from here.
@Component({
  selector: 'app-manage-team',
  imports: [PokemonDetailModal, LoadingScreen, TeamSwapModal, InfoTooltip],
  templateUrl: './manage-team.html',
  styleUrl: './manage-team.css',
})
export class ManageTeam implements AfterViewInit {
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  // The page must never scroll — only the Favorites/Bench lists do, if their
  // content overflows. Rather than guessing the navbar's height in CSS, this
  // measures exactly how much viewport space is actually left below it (the
  // navbar's real height varies with font sizes / wrapping at narrow
  // widths), and pins the page to precisely that.
  protected readonly pageHeightPx = signal<number | null>(null);

  ngAfterViewInit(): void {
    this.measurePageHeight();
  }

  @HostListener('window:resize')
  protected measurePageHeight(): void {
    const top = this.elementRef.nativeElement.getBoundingClientRect().top;
    this.pageHeightPx.set(window.innerHeight - top);
  }
  protected readonly theme = inject(ThemeService);

  protected readonly isLoading = signal(true);
  protected readonly loadingTips = MANAGE_TEAM_LOADING_TIPS;

  // ---- savedState ----
  private readonly savedTeam = signal<ComparablePokemon[]>([]);
  private readonly savedFavorites = signal<ComparablePokemon[]>([]);

  // ---- draftState ----
  protected readonly teamDraft = signal<ComparablePokemon[]>([]);
  protected readonly benchDraft = signal<ComparablePokemon[]>([]); // client-only, never persisted
  protected readonly allFavorites = signal<ComparablePokemon[]>([]);

  protected readonly drag = signal<DragState | null>(null);
  protected readonly overTeamIndex = signal<number | null>(null);
  protected readonly overFav = signal(false);
  protected readonly overBench = signal(false);
  protected readonly overTrash = signal(false);

  // ---- Scouting Bench — non-destructive drag-in comparison of any two
  // cards already on the page (team/favorite/bench). Dropping here never
  // removes the card from wherever it came from — it's a reference copy
  // purely for a quick side-by-side read.
  protected readonly scoutA = signal<ComparablePokemon | null>(null);
  protected readonly scoutB = signal<ComparablePokemon | null>(null);
  protected readonly overScout = signal<0 | 1 | null>(null);

  protected readonly showSaveConfirm = signal(false);
  protected readonly showRevertConfirm = signal(false);
  protected readonly showLeaveConfirm = signal(false);
  protected readonly showSavedToast = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly selectedPokemonId = signal<number | null>(null);

  // ---- Trash / Remove drop zone ----
  // Dropping here never deletes anything by itself — it only stages a
  // confirmation (pendingRemove). Dropping optimistically hides the card
  // from its team slot immediately (index kept so Cancel can put it back in
  // the same spot). confirmRemove() only commits the removal to teamDraft —
  // like every other change on this page (reorder/add/swap), it stays
  // draft-only and never touches the backend until Save Changes runs. This
  // is what lets Revert genuinely restore the exact previous team, even
  // after a removal has already been confirmed here.
  protected readonly pendingRemove = signal<{ item: ComparablePokemon; index: number } | null>(null);
  protected readonly showRemovedToast = signal(false);

  // ---- Head-to-Head comparison (reuses TeamSwapModal) ----
  protected readonly compareAnchorId = signal<number | null>(null);
  protected readonly compareMode = signal<SwapMode>('favorite-vs-team');

  constructor() {
    this.reloadFromServer();
  }

  private reloadFromServer(): void {
    this.isLoading.set(true);
    forkJoin({
      team: this.teamService.getTeamStrict(),
      favorites: this.favoritesService.getFavorites(),
    }).subscribe(({ team, favorites }) => {
      this.savedTeam.set(team);
      this.teamDraft.set(team);
      this.benchDraft.set([]);
      this.savedFavorites.set(favorites);
      this.allFavorites.set(favorites);
      this.isLoading.set(false);
      // The loading screen and the real layout can render at slightly
      // different heights (e.g. once web fonts finish swapping in) — take
      // one more measurement once the real content is up and painted.
      setTimeout(() => this.measurePageHeight(), 0);
    });
  }

  private savedIds(): Set<number> {
    return new Set(this.savedTeam().map((m) => m.pokemonId));
  }

  protected readonly teamSlots = computed(() => {
    const team = this.teamDraft();
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  protected readonly favPool = computed(() => {
    const teamIds = new Set(this.teamDraft().map((m) => m.pokemonId));
    const benchIds = new Set(this.benchDraft().map((m) => m.pokemonId));
    return this.allFavorites().filter((f) => !teamIds.has(f.pokemonId) && !benchIds.has(f.pokemonId));
  });

  // Compares ORDERED pokemonId arrays between draftState and savedState —
  // never object references — so both a pure reorder (same members, new
  // sequence) and a membership change (add/remove) are detected the same
  // way.
  private hasTeamChanges(): boolean {
    const draftOrder = this.teamDraft().map((m) => m.pokemonId);
    const savedOrder = this.savedTeam().map((m) => m.pokemonId);
    if (draftOrder.length !== savedOrder.length) return true;
    return draftOrder.some((id, i) => id !== savedOrder[i]);
  }

  // Favorites have no meaningful order, so this is a plain set comparison —
  // unlike the team, an add and a remove are symmetric, not a sequence.
  private hasFavoriteChanges(): boolean {
    const draftIds = new Set(this.allFavorites().map((f) => f.pokemonId));
    const savedIds = new Set(this.savedFavorites().map((f) => f.pokemonId));
    if (draftIds.size !== savedIds.size) return true;
    return [...draftIds].some((id) => !savedIds.has(id));
  }

  protected readonly hasUnsavedChanges = computed(() => this.hasTeamChanges() || this.hasFavoriteChanges());

  // Live preview of the draft team's stats — recomputed from teamDraft(),
  // not savedTeam(), using the exact same shared calculations as Home/My
  // Team, so dragging a card in updates Power/coverage immediately, before
  // Save Changes — lets a trainer see the effect of a change before
  // committing to it.
  protected readonly draftTeamPower = computed(() => getTeamPower(this.teamDraft()));
  protected readonly draftTypeSegments = computed(() => getTypeSegments(this.teamDraft()));

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  isFavorite(pokemonId: number): boolean {
    return this.allFavorites().some((f) => f.pokemonId === pokemonId);
  }

  isOnTeam(pokemonId: number): boolean {
    return this.teamDraft().some((m) => m.pokemonId === pokemonId);
  }

  // Used to visually distinguish a team slot that was already part of the
  // saved team before this visit from one that's only in the draft so far
  // (added/moved in during this editing session, not yet saved).
  isSavedOnTeam(pokemonId: number): boolean {
    return this.savedIds().has(pokemonId);
  }

  // ---- drag lifecycle ----
  startDrag(item: ComparablePokemon, from: DragSource): void {
    this.drag.set({ item, from });
  }

  endDrag(): void {
    this.drag.set(null);
    this.overTeamIndex.set(null);
    this.overFav.set(false);
    this.overBench.set(false);
    this.overTrash.set(false);
  }

  onTeamSlotDragOver(index: number): void {
    if (this.overTeamIndex() !== index) {
      this.overTeamIndex.set(index);
      this.overFav.set(false);
      this.overBench.set(false);
      this.overTrash.set(false);
    }
  }

  onFavDragOver(): void {
    if (!this.overFav()) {
      this.overFav.set(true);
      this.overTeamIndex.set(null);
      this.overBench.set(false);
      this.overTrash.set(false);
    }
  }

  onBenchDragOver(): void {
    if (!this.overBench()) {
      this.overBench.set(true);
      this.overTeamIndex.set(null);
      this.overFav.set(false);
      this.overTrash.set(false);
    }
  }

  onTrashDragOver(): void {
    if (!this.overTrash()) {
      this.overTrash.set(true);
      this.overTeamIndex.set(null);
      this.overFav.set(false);
      this.overBench.set(false);
    }
  }

  // ---- Scouting Bench ----

  onScoutDragOver(index: 0 | 1): void {
    if (this.overScout() !== index) this.overScout.set(index);
  }

  onScoutDragLeave(index: 0 | 1): void {
    if (this.overScout() === index) this.overScout.set(null);
  }

  onScoutDrop(index: 0 | 1): void {
    const item = this.drag()?.item;
    this.overScout.set(null);
    if (!item) return;
    if (index === 0) this.scoutA.set(item);
    else this.scoutB.set(item);
  }

  clearScout(index: 0 | 1): void {
    if (index === 0) this.scoutA.set(null);
    else this.scoutB.set(null);
  }

  private static readonly SCOUT_STAT_KEYS = ['hp', 'attack', 'defense'] as const;
  private static readonly SCOUT_STAT_LABELS: Record<string, string> = { hp: 'HP', attack: 'ATK', defense: 'DEF' };

  // A small 3-stat read (HP/ATK/DEF) per scouted side, each row colored
  // toward whichever side currently wins it — mirrors the mockup's own
  // compact per-card comparison exactly (no separate stat table).
  scoutStatsFor(which: 0 | 1): { label: string; value: number; pct: number; wins: boolean }[] {
    const self = which === 0 ? this.scoutA() : this.scoutB();
    const other = which === 0 ? this.scoutB() : this.scoutA();
    if (!self) return [];
    return ManageTeam.SCOUT_STAT_KEYS.map((key) => {
      const value = self.stats.find((s) => s.name === key)?.value ?? 0;
      const otherValue = other?.stats.find((s) => s.name === key)?.value ?? null;
      return {
        label: ManageTeam.SCOUT_STAT_LABELS[key],
        value,
        pct: Math.min(100, Math.round((value / 150) * 100)),
        wins: otherValue != null && value > otherValue,
      };
    });
  }

  // Drag-and-drop only ever touches teamDraft/benchDraft — draftState — and
  // never calls the backend. Only Save Changes does that.
  moveToTeam(index: number): void {
    const drag = this.drag();
    if (!drag) return;

    let team = this.teamDraft().filter((m) => m.pokemonId !== drag.item.pokemonId);
    const bench = this.benchDraft().filter((m) => m.pokemonId !== drag.item.pokemonId);

    if (drag.from !== 'team' && team.length >= MAX_TEAM_SIZE) {
      this.endDrag();
      return;
    }

    const idx = Math.min(index, team.length);
    team = [...team.slice(0, idx), drag.item, ...team.slice(idx)];
    this.teamDraft.set(team);
    this.benchDraft.set(bench);
    this.endDrag();
  }

  // Dropping onto Favorites returns the card to the pool and marks it as a
  // favorite in the draft only — like every other change on this page, it's
  // only committed to the backend when Save Changes runs.
  moveToFav(): void {
    const drag = this.drag();
    if (!drag) return;

    this.teamDraft.update((list) => list.filter((m) => m.pokemonId !== drag.item.pokemonId));
    this.benchDraft.update((list) => list.filter((m) => m.pokemonId !== drag.item.pokemonId));
    this.endDrag();

    if (!this.isFavorite(drag.item.pokemonId)) {
      this.allFavorites.update((list) => [...list, drag.item]);
    }
  }

  // Bench is a temporary holding area only — never persisted, and favorite
  // status is left completely untouched either way.
  moveToBench(): void {
    const drag = this.drag();
    if (!drag) return;

    this.teamDraft.update((list) => list.filter((m) => m.pokemonId !== drag.item.pokemonId));
    this.benchDraft.update((list) => [...list.filter((m) => m.pokemonId !== drag.item.pokemonId), drag.item]);
    this.endDrag();
  }

  // Only accepts drags that originate FROM the team — dropping a Favorites
  // or Bench card here does nothing, since those aren't team members to
  // remove. The card disappears from its team slot right away (optimistic —
  // Cancel puts it straight back in the same spot); only confirming actually
  // deletes anything.
  moveToTrash(): void {
    const drag = this.drag();
    this.endDrag();
    if (!drag || drag.from !== 'team') return;

    const index = this.teamDraft().findIndex((m) => m.pokemonId === drag.item.pokemonId);
    if (index === -1) return;

    this.teamDraft.update((list) => list.filter((m) => m.pokemonId !== drag.item.pokemonId));
    this.pendingRemove.set({ item: drag.item, index });
  }

  cancelRemove(): void {
    const pending = this.pendingRemove();
    if (pending) {
      const idx = Math.min(pending.index, this.teamDraft().length);
      this.teamDraft.update((list) => [...list.slice(0, idx), pending.item, ...list.slice(idx)]);
    }
    this.pendingRemove.set(null);
  }

  // Already gone from teamDraft since the drop itself — this only clears the
  // pending-removal safety net. Draft-only, like every other change on this
  // page: nothing reaches the backend until Save Changes runs, which is what
  // lets Revert bring this Pokémon straight back if the user changes their
  // mind later in the same session.
  confirmRemove(): void {
    if (!this.pendingRemove()) return;
    this.pendingRemove.set(null);
    this.showRemovedToast.set(true);
    setTimeout(() => this.showRemovedToast.set(false), 2400);
  }

  openDetail(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
  }

  closeDetail(): void {
    this.selectedPokemonId.set(null);
  }

  // Modal already confirmed with the user before emitting this. Draft-only,
  // same as the drag-to-trash flow above — nothing here touches the backend
  // until Save Changes runs.
  removeFromTeamModal(pokemonId: number): void {
    this.teamDraft.update((list) => list.filter((m) => m.pokemonId !== pokemonId));
    this.closeDetail();
  }

  // Draft-only, same as every other change on this page — committed to the
  // backend only when Save Changes runs.
  toggleFavoriteFromModal(pokemonId: number): void {
    if (this.isFavorite(pokemonId)) {
      this.allFavorites.update((list) => list.filter((f) => f.pokemonId !== pokemonId));
      return;
    }
    const fromTeam = this.teamDraft().find((m) => m.pokemonId === pokemonId);
    const fromBench = this.benchDraft().find((m) => m.pokemonId === pokemonId);
    const member = fromTeam ?? fromBench;
    if (member) this.allFavorites.update((list) => [...list, member]);
  }

  // Adding straight from the Detail Modal stages the change the same way a
  // drag onto the team section would — still requires Save Changes.
  addToTeamFromModal(pokemonId: number): void {
    // Full/duplicate/not-found all return early here without closing the
    // modal — only a real staged add (below) closes it.
    if (this.isOnTeam(pokemonId) || this.teamDraft().length >= MAX_TEAM_SIZE) return;
    const member = this.allFavorites().find((f) => f.pokemonId === pokemonId)
      ?? this.benchDraft().find((m) => m.pokemonId === pokemonId);
    if (!member) return;
    this.benchDraft.update((list) => list.filter((m) => m.pokemonId !== pokemonId));
    this.teamDraft.update((list) => [...list, member]);
    this.closeDetail();
  }

  // ---- Save Changes ----

  requestSave(): void {
    if (!this.hasUnsavedChanges()) return;
    this.saveError.set(null);
    this.showSaveConfirm.set(true);
  }

  cancelSave(): void {
    if (this.isSaving()) return;
    this.showSaveConfirm.set(false);
  }

  confirmSave(): void {
    const finalOrder = this.teamDraft().map((m) => m.pokemonId);

    // Favorites diff: only entries that differ from the last saved snapshot
    // need a real API call — everything else on the page was already true
    // as of the last save.
    const savedFavIds = new Set(this.savedFavorites().map((f) => f.pokemonId));
    const draftFavorites = this.allFavorites();
    const draftFavIds = new Set(draftFavorites.map((f) => f.pokemonId));
    const toAdd = draftFavorites.filter((f) => !savedFavIds.has(f.pokemonId));
    const toRemove = this.savedFavorites().filter((f) => !draftFavIds.has(f.pokemonId));

    type FavoriteResult = { pokemon: ComparablePokemon; ok: boolean; kind: 'add' | 'remove' };
    const favoriteCalls: Observable<FavoriteResult>[] = [
      ...toAdd.map((f) =>
        this.favoritesService.addFavorite(f.pokemonId).pipe(map((ok) => ({ pokemon: f, ok, kind: 'add' as const }))),
      ),
      ...toRemove.map((f) =>
        this.favoritesService.removeFavorite(f.pokemonId).pipe(map((ok) => ({ pokemon: f, ok, kind: 'remove' as const }))),
      ),
    ];

    this.isSaving.set(true);
    this.saveError.set(null);

    // Team save stays one atomic backend call (add/remove/reorder together)
    // — either the whole new team lands, or none of it does. Favorite
    // changes are independent (no cap, no ordering), so they run alongside
    // it rather than being folded into the same endpoint.
    forkJoin({
      team: this.teamService.saveTeam(finalOrder),
      favorites: favoriteCalls.length === 0 ? of([] as FavoriteResult[]) : forkJoin(favoriteCalls),
    }).subscribe(({ team, favorites }) => {
      this.isSaving.set(false);
      if (!team.ok) {
        this.saveError.set(team.message);
        return;
      }

      // savedTeam comes from what the server actually persisted, not from
      // the local draft — the two should match, but the server's response is
      // the authoritative one.
      this.savedTeam.set(team.team);
      this.teamDraft.set(team.team);

      // Reconcile savedFavorites with whichever adds/removes actually
      // succeeded — a failed favorite call just leaves that one entry as
      // still "unsaved," so the next Save Changes retries only it, without
      // undoing the team save that already succeeded above.
      let nextSavedFavorites = this.savedFavorites();
      for (const r of favorites) {
        if (!r.ok) continue;
        nextSavedFavorites =
          r.kind === 'add'
            ? [...nextSavedFavorites, r.pokemon]
            : nextSavedFavorites.filter((f) => f.pokemonId !== r.pokemon.pokemonId);
      }
      this.savedFavorites.set(nextSavedFavorites);

      // A favorite-call failure keeps the confirm dialog open with the
      // error shown (same pattern as a team-save failure above) — the team
      // save already succeeded and won't be retried, but "Save Changes"
      // clicked again will only retry whichever favorite(s) are still
      // unreconciled.
      const failedFavorite = favorites.some((r) => !r.ok);
      if (failedFavorite) {
        this.saveError.set('Team saved, but some favorite changes could not be saved. Please try again.');
        return;
      }

      this.showSaveConfirm.set(false);
      this.showSavedToast.set(true);
      setTimeout(() => this.showSavedToast.set(false), 2400);
    });
  }

  // ---- Revert ----

  requestRevert(): void {
    if (!this.hasUnsavedChanges()) return;
    this.showRevertConfirm.set(true);
  }

  cancelRevert(): void {
    this.showRevertConfirm.set(false);
  }

  confirmRevert(): void {
    this.teamDraft.set(this.savedTeam());
    this.benchDraft.set([]);
    this.allFavorites.set(this.savedFavorites());
    this.showRevertConfirm.set(false);
  }

  // ---- Back to My Team ----

  goBackToMyTeam(): void {
    if (!this.hasUnsavedChanges()) {
      this.router.navigateByUrl('/my-team');
      return;
    }
    this.showLeaveConfirm.set(true);
  }

  stayHere(): void {
    this.showLeaveConfirm.set(false);
  }

  leaveWithoutSaving(): void {
    this.showLeaveConfirm.set(false);
    this.teamDraft.set(this.savedTeam());
    this.benchDraft.set([]);
    this.allFavorites.set(this.savedFavorites());
    this.router.navigateByUrl('/my-team');
  }

  // ---- Head-to-Head comparison ----

  // Candidates offered when comparing a fixed FAVORITE against the team:
  // only members already confirmed on the real team (an unsaved local drag
  // change can't be swapped via the real endpoint yet).
  protected readonly savedTeamMembers = computed(() => {
    const ids = this.savedIds();
    return this.teamDraft().filter((m) => ids.has(m.pokemonId));
  });

  // Candidates offered when comparing a fixed TEAM member against
  // favorites: every favorite not already on the team.
  protected readonly favoriteCandidates = computed(() => {
    const ids = this.savedIds();
    return this.allFavorites().filter((f) => !ids.has(f.pokemonId));
  });

  protected readonly compareCandidates = computed<ComparablePokemon[]>(() =>
    this.compareMode() === 'team-vs-favorites' ? this.favoriteCandidates() : this.savedTeamMembers(),
  );

  // Always local-only on this page — like every other change here, a
  // Compare/Swap pick is only staged into the draft and never touches the
  // real swap endpoint. It's captured by the normal Save Changes flow later,
  // same as a drag-and-drop reorder or a trash removal.
  protected readonly comparePersistImmediately = computed(() => false);

  compareFavoriteAgainstTeam(pokemonId: number): void {
    this.compareMode.set('favorite-vs-team');
    this.compareAnchorId.set(pokemonId);
  }

  compareTeamAgainstFavorites(pokemonId: number): void {
    this.compareMode.set('team-vs-favorites');
    this.compareAnchorId.set(pokemonId);
  }

  closeCompare(): void {
    this.compareAnchorId.set(null);
  }

  // Always draft-only (persistImmediately is always false on this page) —
  // apply the swap locally, captured by the normal Save Changes flow later.
  // The favorite being swapped in never leaves Favorites; it just moves out
  // of the pool/bench into the team draft.
  onCompareSwapped(result: { removedPokemonId: number; addedPokemonId: number }): void {
    this.compareAnchorId.set(null);

    const incoming = this.allFavorites().find((f) => f.pokemonId === result.addedPokemonId);
    if (!incoming) return;
    this.teamDraft.update((list) =>
      list.map((m) => (m.pokemonId === result.removedPokemonId ? incoming : m)),
    );
    this.benchDraft.update((list) => list.filter((m) => m.pokemonId !== result.addedPokemonId));
  }
}
