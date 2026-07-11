import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TeamService } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { getTeamPower, getTeamTier, getTypeSegments } from '../../shared/team-power';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { TeamSwapModal, ComparablePokemon, SwapMode } from '../../shared/team-swap-modal/team-swap-modal';

const MAX_TEAM_SIZE = 5;

type DragSource = 'team' | 'fav' | 'bench';
interface DragState {
  item: ComparablePokemon;
  from: DragSource;
}

// This page follows a savedState / draftState pattern:
//   - savedTeam  = the last state actually confirmed by the backend.
//   - teamDraft  = the local, in-progress state the user is editing by
//     dragging cards around. Nothing here is real until Save Changes.
// hasUnsavedChanges() always compares the two by ORDERED pokemonId arrays —
// never by object identity — so a pure reorder (same 5 members, different
// order) is detected exactly the same way an add/remove is.
//
// Favorites are persisted to the backend the instant you drag onto the
// Favorites pool (matching the "favorite toggle is instant" convention used
// everywhere else in the app) — they are never part of the draft/Save flow.
// The Bench is purely client-side and is never sent to the backend at all.
//
// The "Compare" action on a team slot / favorite card opens the shared
// TeamSwapModal directly against the real backend (same swap endpoint the
// Explorer/Home overflow flow uses) when its anchor is already-saved —
// it is NOT staged through the draft/Save mechanism in that case, so a
// successful compare-swap reloads fresh state from the server afterward.
@Component({
  selector: 'app-manage-team',
  imports: [PokemonDetailModal, LoadingScreen, TeamSwapModal],
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

  // ---- savedState ----
  private readonly savedTeam = signal<ComparablePokemon[]>([]);

  // ---- draftState ----
  protected readonly teamDraft = signal<ComparablePokemon[]>([]);
  protected readonly benchDraft = signal<ComparablePokemon[]>([]); // client-only, never persisted
  protected readonly allFavorites = signal<ComparablePokemon[]>([]);

  protected readonly drag = signal<DragState | null>(null);
  protected readonly overTeamIndex = signal<number | null>(null);
  protected readonly overFav = signal(false);
  protected readonly overBench = signal(false);
  protected readonly overTrash = signal(false);

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
  // the same spot) — only confirmRemove() actually calls the backend, and it
  // does so immediately (the existing DELETE /api/team/:id, same endpoint
  // Explorer's remove button already uses) rather than going through the
  // draft/Save Changes flow, since a confirmed removal is a real, committed
  // action, not a pending edit.
  protected readonly pendingRemove = signal<{ item: ComparablePokemon; index: number } | null>(null);
  protected readonly isRemoving = signal(false);
  protected readonly removeError = signal<string | null>(null);
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
  protected readonly hasUnsavedChanges = computed(() => {
    const draftOrder = this.teamDraft().map((m) => m.pokemonId);
    const savedOrder = this.savedTeam().map((m) => m.pokemonId);
    if (draftOrder.length !== savedOrder.length) return true;
    return draftOrder.some((id, i) => id !== savedOrder[i]);
  });

  // Live preview of the draft team's stats — recomputed from teamDraft(),
  // not savedTeam(), using the exact same shared calculations as Home/My
  // Team, so dragging a card in updates Power/tier/coverage immediately,
  // before Save Changes — lets a trainer see the effect of a change before
  // committing to it.
  protected readonly draftTeamPower = computed(() => getTeamPower(this.teamDraft()));
  protected readonly draftTeamTier = computed(() => getTeamTier(this.teamDraft().length));
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

  // A team slot is only eligible for the real Compare & Swap flow once it's
  // actually persisted server-side — a member that only exists in the local
  // drag draft (not yet saved) can't be swapped via the real endpoint.
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

  // Dropping onto Favorites returns the card to the pool and guarantees it's
  // marked as a favorite — calls the real API right away, not gated by Save
  // (Favorites are a separate persisted concept from the team draft).
  moveToFav(): void {
    const drag = this.drag();
    if (!drag) return;

    this.teamDraft.update((list) => list.filter((m) => m.pokemonId !== drag.item.pokemonId));
    this.benchDraft.update((list) => list.filter((m) => m.pokemonId !== drag.item.pokemonId));
    this.endDrag();

    if (!this.isFavorite(drag.item.pokemonId)) {
      this.favoritesService.addFavorite(drag.item.pokemonId).subscribe((ok) => {
        if (ok) this.allFavorites.update((list) => [...list, drag.item]);
      });
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

    this.removeError.set(null);
    this.teamDraft.update((list) => list.filter((m) => m.pokemonId !== drag.item.pokemonId));
    this.pendingRemove.set({ item: drag.item, index });
  }

  cancelRemove(): void {
    if (this.isRemoving()) return;
    const pending = this.pendingRemove();
    if (pending) {
      const idx = Math.min(pending.index, this.teamDraft().length);
      this.teamDraft.update((list) => [...list.slice(0, idx), pending.item, ...list.slice(idx)]);
    }
    this.pendingRemove.set(null);
  }

  confirmRemove(): void {
    const pending = this.pendingRemove();
    if (!pending) return;
    const target = pending.item;

    this.isRemoving.set(true);
    this.removeError.set(null);

    this.teamService.removeFromTeam(target.pokemonId).subscribe({
      next: () => {
        this.isRemoving.set(false);
        // Already gone from teamDraft since the drop itself — just reconcile
        // savedState now that the backend confirms it's really deleted, so
        // hasUnsavedChanges() still correctly reflects only whatever OTHER
        // reorder is pending.
        this.savedTeam.update((list) => list.filter((m) => m.pokemonId !== target.pokemonId));
        this.pendingRemove.set(null);
        this.showRemovedToast.set(true);
        setTimeout(() => this.showRemovedToast.set(false), 2400);
      },
      error: () => {
        this.isRemoving.set(false);
        this.removeError.set('Something went wrong removing this Pokémon. Please try again.');
      },
    });
  }

  openDetail(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
  }

  closeDetail(): void {
    this.selectedPokemonId.set(null);
  }

  // Modal already confirmed with the user before emitting this — same real
  // DELETE /api/team/:id endpoint the drag-to-trash flow above uses, applied
  // directly to both teamDraft and savedTeam since this page's team state
  // isn't refetched from the server like the other pages.
  removeFromTeamModal(pokemonId: number): void {
    this.teamService.removeFromTeam(pokemonId).subscribe(() => {
      this.teamDraft.update((list) => list.filter((m) => m.pokemonId !== pokemonId));
      this.savedTeam.update((list) => list.filter((m) => m.pokemonId !== pokemonId));
      this.closeDetail();
    });
  }

  toggleFavoriteFromModal(pokemonId: number): void {
    const obs = this.isFavorite(pokemonId)
      ? this.favoritesService.removeFavorite(pokemonId)
      : this.favoritesService.addFavorite(pokemonId);
    obs.subscribe((ok) => {
      if (!ok) return;
      if (this.isFavorite(pokemonId)) {
        this.allFavorites.update((list) => list.filter((f) => f.pokemonId !== pokemonId));
      } else {
        const fromTeam = this.teamDraft().find((m) => m.pokemonId === pokemonId);
        const fromBench = this.benchDraft().find((m) => m.pokemonId === pokemonId);
        const member = fromTeam ?? fromBench;
        if (member) this.allFavorites.update((list) => [...list, member]);
      }
    });
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

    this.isSaving.set(true);
    this.saveError.set(null);

    // One atomic backend call (add/remove/reorder together) instead of three
    // separate requests — either the whole new team lands, or none of it
    // does. `teamDraft` is left untouched until the server confirms success,
    // so a failed save never pretends to have worked.
    this.teamService.saveTeam(finalOrder).subscribe((result) => {
      this.isSaving.set(false);
      if (!result.ok) {
        this.saveError.set(result.message);
        return;
      }
      this.showSaveConfirm.set(false);
      // savedState comes from what the server actually persisted, not from
      // the local draft — the two should match, but the server's response is
      // the authoritative one.
      this.savedTeam.set(result.team);
      this.teamDraft.set(result.team);
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

  // A team-vs-favorites comparison can only hit the real swap endpoint if
  // its anchor is an actual, already-saved team member. If the anchor is
  // only sitting in the local drag draft (just dragged in, not yet saved),
  // there's nothing real to remove server-side yet — the modal is told to
  // skip the backend call and just report the pick instead.
  protected readonly comparePersistImmediately = computed(() => {
    if (this.compareMode() !== 'team-vs-favorites') return true;
    const id = this.compareAnchorId();
    return id !== null && this.isSavedOnTeam(id);
  });

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

  onCompareSwapped(result: { removedPokemonId: number; addedPokemonId: number }): void {
    const wasImmediate = this.comparePersistImmediately();
    this.compareAnchorId.set(null);

    if (wasImmediate) {
      // The swap already happened against the real backend (same endpoint
      // as the Explorer/Home overflow flow) — reload authoritative
      // state so the page reflects it. This intentionally discards any
      // OTHER not-yet-saved local drag arrangement, since the server-side
      // team just changed underneath it.
      this.reloadFromServer();
      return;
    }

    // The anchor was only a local, unsaved draft pick — apply the swap
    // locally too (no backend call). It's captured by the normal Save
    // Changes flow later. The favorite being swapped in never leaves
    // Favorites; it just moves out of the pool/bench into the team draft.
    const incoming = this.allFavorites().find((f) => f.pokemonId === result.addedPokemonId);
    if (!incoming) return;
    this.teamDraft.update((list) =>
      list.map((m) => (m.pokemonId === result.removedPokemonId ? incoming : m)),
    );
    this.benchDraft.update((list) => list.filter((m) => m.pokemonId !== result.addedPokemonId));
  }
}
