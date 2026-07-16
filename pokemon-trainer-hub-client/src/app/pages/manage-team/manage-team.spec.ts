import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeamService } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { ComparablePokemon } from '../../shared/team-swap-modal/team-swap-modal';
import { ManageTeam } from './manage-team';

describe('ManageTeam', () => {
  let getTeamStrict: ReturnType<typeof vi.fn>;
  let saveTeam: ReturnType<typeof vi.fn>;
  let getFavorites: ReturnType<typeof vi.fn>;
  let addFavorite: ReturnType<typeof vi.fn>;
  let removeFavorite: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  function mon(id: number, overrides: Partial<ComparablePokemon> = {}): ComparablePokemon {
    return {
      pokemonId: id,
      pokemonName: `mon-${id}`,
      spriteUrl: 's',
      types: ['fire'],
      baseExperience: 100,
      stats: [{ name: 'hp', value: 50 }, { name: 'attack', value: 60 }, { name: 'defense', value: 40 }],
      ...overrides,
    };
  }

  function setup(options: {
    team?: ComparablePokemon[];
    favorites?: ComparablePokemon[];
    saveTeamResult?: any;
  } = {}) {
    getTeamStrict = vi.fn(() => of(options.team ?? [mon(1), mon(2)]));
    saveTeam = vi.fn(() => of(options.saveTeamResult ?? { ok: true, team: options.team ?? [mon(1), mon(2)] }));
    getFavorites = vi.fn(() => of(options.favorites ?? []));
    addFavorite = vi.fn(() => of(true));
    removeFavorite = vi.fn(() => of(true));
    navigateByUrl = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: TeamService, useValue: { getTeamStrict, saveTeam } },
        { provide: FavoritesService, useValue: { getFavorites, addFavorite, removeFavorite } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    const fixture = TestBed.createComponent(ManageTeam);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the real team/favorites into both saved and draft state on init', () => {
    const fixture = setup({ team: [mon(1), mon(2)], favorites: [mon(3)] });
    const inst = fixture.componentInstance as any;
    expect(inst.isLoading()).toBe(false);
    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([1, 2]);
    expect(inst.allFavorites().map((m: any) => m.pokemonId)).toEqual([3]);
  });

  it('teamSlots() pads the draft team to 5 with null placeholders', () => {
    const fixture = setup({ team: [mon(1)] });
    const slots = (fixture.componentInstance as any).teamSlots();
    expect(slots.length).toBe(5);
    expect(slots[0].pokemonId).toBe(1);
    expect(slots[1]).toBeNull();
  });

  it('favPool() excludes favorites already on the team draft or the bench', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(1), mon(2), mon(3)] });
    const inst = fixture.componentInstance as any;
    inst.benchDraft.set([mon(3)]);
    expect(inst.favPool().map((f: any) => f.pokemonId)).toEqual([2]);
  });

  it('hasUnsavedChanges() is false right after load', () => {
    const fixture = setup({ team: [mon(1), mon(2)] });
    expect((fixture.componentInstance as any).hasUnsavedChanges()).toBe(false);
  });

  it('hasUnsavedChanges() detects a pure reorder (same members, new sequence)', () => {
    const fixture = setup({ team: [mon(1), mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(2), mon(1)]);
    expect(inst.hasUnsavedChanges()).toBe(true);
  });

  it('hasUnsavedChanges() detects a favorites-only change (set comparison, no order)', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.allFavorites.set([mon(2), mon(3)]);
    expect(inst.hasUnsavedChanges()).toBe(true);
  });

  it('draftTeamPower()/draftTypeSegments() are computed from the live draft, not the saved snapshot', () => {
    const fixture = setup({ team: [mon(1, { baseExperience: 100 })] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(1, { baseExperience: 100 }), mon(2, { baseExperience: 50 })]);
    expect(inst.draftTeamPower()).toBe(150);
  });

  it('isSavedOnTeam() reflects the last-saved snapshot, not the live draft', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(1), mon(2)]); // 2 added only in the draft
    expect(fixture.componentInstance.isSavedOnTeam(1)).toBe(true);
    expect(fixture.componentInstance.isSavedOnTeam(2)).toBe(false);
  });

  it('drag-over handlers are mutually exclusive (entering one zone clears the others)', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.onFavDragOver();
    expect(inst.overFav()).toBe(true);

    fixture.componentInstance.onTrashDragOver();
    expect(inst.overTrash()).toBe(true);
    expect(inst.overFav()).toBe(false);
  });

  it('endDrag() clears the drag state and every drop-zone highlight', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(1), 'team');
    fixture.componentInstance.onBenchDragOver();

    fixture.componentInstance.endDrag();

    expect(inst.drag()).toBeNull();
    expect(inst.overBench()).toBe(false);
  });

  it('moveToTeam() inserts the dragged item at the drop index', () => {
    const fixture = setup({ team: [mon(1), mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.benchDraft.set([mon(9)]);
    inst.startDrag(mon(9), 'bench');

    fixture.componentInstance.moveToTeam(1);

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([1, 9, 2]);
    expect(inst.benchDraft()).toEqual([]);
  });

  it('moveToTeam() refuses a drop from bench/favorites once the team draft is already full', () => {
    const full = [mon(1), mon(2), mon(3), mon(4), mon(5)];
    const fixture = setup({ team: full });
    const inst = fixture.componentInstance as any;
    inst.benchDraft.set([mon(9)]);
    inst.startDrag(mon(9), 'bench');

    fixture.componentInstance.moveToTeam(0);

    expect(inst.teamDraft().length).toBe(5);
    expect(inst.teamDraft().some((m: any) => m.pokemonId === 9)).toBe(false);
  });

  it('moveToTeam() allows repositioning a card already on the team even when the team is "full"', () => {
    const full = [mon(1), mon(2), mon(3), mon(4), mon(5)];
    const fixture = setup({ team: full });
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(1), 'team');

    fixture.componentInstance.moveToTeam(4);

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([2, 3, 4, 5, 1]);
  });

  it('moveToFav() returns the card to the pool and marks it favorited in the draft only', () => {
    const fixture = setup({ team: [mon(1)], favorites: [] });
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(1), 'team');

    fixture.componentInstance.moveToFav();

    expect(inst.teamDraft()).toEqual([]);
    expect(inst.allFavorites().some((f: any) => f.pokemonId === 1)).toBe(true);
    expect(addFavorite).not.toHaveBeenCalled(); // draft-only, not persisted yet
  });

  it('moveToBench() removes from the team draft without touching favorite status', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(1), 'team');

    fixture.componentInstance.moveToBench();

    expect(inst.teamDraft()).toEqual([]);
    expect(inst.benchDraft().map((m: any) => m.pokemonId)).toEqual([1]);
    expect(inst.allFavorites()).toEqual([]);
  });

  it('moveToTrash() only accepts a drag that originated from the team', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(2), 'fav');

    fixture.componentInstance.moveToTrash();

    expect(inst.teamDraft().length).toBe(1); // untouched
    expect(inst.pendingRemove()).toBeNull();
  });

  it('moveToTrash() optimistically removes from the draft and stages a pending removal with its index', () => {
    const fixture = setup({ team: [mon(1), mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(2), 'team');

    fixture.componentInstance.moveToTrash();

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([1]);
    expect(inst.pendingRemove()).toEqual({ item: mon(2), index: 1 });
  });

  it('cancelRemove() puts the item back at its original index', () => {
    const fixture = setup({ team: [mon(1), mon(2), mon(3)] });
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(2), 'team');
    fixture.componentInstance.moveToTrash();

    fixture.componentInstance.cancelRemove();

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([1, 2, 3]);
    expect(inst.pendingRemove()).toBeNull();
  });

  it('confirmRemove() clears the pending removal and shows a toast that clears itself', () => {
    vi.useFakeTimers();
    const fixture = setup({ team: [mon(1), mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(2), 'team');
    fixture.componentInstance.moveToTrash();

    fixture.componentInstance.confirmRemove();

    expect(inst.pendingRemove()).toBeNull();
    expect(inst.showRemovedToast()).toBe(true);
    vi.advanceTimersByTime(2400);
    expect(inst.showRemovedToast()).toBe(false);
    vi.useRealTimers();
  });

  it('removeFromTeamModal() removes from the draft only and closes the detail modal', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    inst.selectedPokemonId.set(1);

    fixture.componentInstance.removeFromTeamModal(1);

    expect(inst.teamDraft()).toEqual([]);
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('toggleFavoriteFromModal(): un-favorites when already favorited', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(1)] });
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.toggleFavoriteFromModal(1);

    expect(inst.allFavorites()).toEqual([]);
  });

  it('toggleFavoriteFromModal(): favorites a team or bench member when not already favorited', () => {
    const fixture = setup({ team: [mon(1)], favorites: [] });
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.toggleFavoriteFromModal(1);

    expect(inst.allFavorites().map((f: any) => f.pokemonId)).toEqual([1]);
  });

  it('addToTeamFromModal(): no-op if already on team or the draft is full', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(1)] });
    fixture.componentInstance.addToTeamFromModal(1);
    expect((fixture.componentInstance as any).teamDraft().length).toBe(1);
  });

  it('addToTeamFromModal(): stages the add from favorites and closes the detail modal', () => {
    const fixture = setup({ team: [], favorites: [mon(9)] });
    const inst = fixture.componentInstance as any;
    inst.selectedPokemonId.set(9);

    fixture.componentInstance.addToTeamFromModal(9);

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([9]);
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('requestSave()/cancelSave() gate on real unsaved changes', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestSave();
    expect(inst.showSaveConfirm()).toBe(false); // nothing changed yet

    inst.teamDraft.set([mon(1), mon(2)]);
    fixture.componentInstance.requestSave();
    expect(inst.showSaveConfirm()).toBe(true);

    fixture.componentInstance.cancelSave();
    expect(inst.showSaveConfirm()).toBe(false);
  });

  it('confirmSave(): saves the team and only the favorites that actually changed', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(1), mon(3)]);
    inst.allFavorites.set([mon(4)]); // 2 removed, 4 added

    fixture.componentInstance.confirmSave();

    expect(saveTeam).toHaveBeenCalledWith([1, 3]);
    expect(addFavorite).toHaveBeenCalledWith(4);
    expect(removeFavorite).toHaveBeenCalledWith(2);
    expect(inst.showSaveConfirm()).toBe(false);
    expect(inst.showSavedToast()).toBe(true);
  });

  it('confirmSave(): a team-save failure surfaces the real error and keeps the confirm dialog open', () => {
    const fixture = setup({ team: [mon(1)], saveTeamResult: { ok: false, message: 'Something went wrong saving team changes.' } });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(1), mon(2)]);

    fixture.componentInstance.confirmSave();

    expect(inst.saveError()).toBe('Something went wrong saving team changes.');
    expect(inst.isSaving()).toBe(false);
  });

  it('confirmSave(): a partial favorites failure surfaces its own message without undoing the successful team save', () => {
    removeFavorite = vi.fn(() => of(false));
    TestBed.configureTestingModule({
      providers: [
        { provide: TeamService, useValue: { getTeamStrict: () => of([mon(1)]), saveTeam: () => of({ ok: true, team: [mon(1)] }) } },
        { provide: FavoritesService, useValue: { getFavorites: () => of([mon(2)]), addFavorite: vi.fn(() => of(true)), removeFavorite } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ManageTeam);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;
    inst.allFavorites.set([]); // remove favorite 2

    fixture.componentInstance.confirmSave();

    expect(inst.saveError()).toBe('Team saved, but some favorite changes could not be saved. Please try again.');
    expect(inst.savedFavorites().map((f: any) => f.pokemonId)).toEqual([2]); // failed removal not reconciled
  });

  it('requestRevert()/confirmRevert() restore the exact pre-visit team and favorites, clearing the bench', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(3)]);
    inst.benchDraft.set([mon(1)]);
    inst.allFavorites.set([mon(4)]);

    fixture.componentInstance.requestRevert();
    expect(inst.showRevertConfirm()).toBe(true);

    fixture.componentInstance.confirmRevert();

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([1]);
    expect(inst.benchDraft()).toEqual([]);
    expect(inst.allFavorites().map((f: any) => f.pokemonId)).toEqual([2]);
    expect(inst.showRevertConfirm()).toBe(false);
  });

  it('cancelRevert() closes the confirm dialog without touching the draft', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(2)]);
    fixture.componentInstance.requestRevert();

    fixture.componentInstance.cancelRevert();

    expect(inst.showRevertConfirm()).toBe(false);
    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([2]);
  });

  it('goBackToMyTeam() navigates immediately when nothing changed', () => {
    const fixture = setup({ team: [mon(1)] });
    fixture.componentInstance.goBackToMyTeam();
    expect(navigateByUrl).toHaveBeenCalledWith('/my-team');
  });

  it('goBackToMyTeam() asks for confirmation when there are unsaved changes', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(2)]);

    fixture.componentInstance.goBackToMyTeam();

    expect(inst.showLeaveConfirm()).toBe(true);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('leaveWithoutSaving() reverts the draft and navigates away', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(2)]);

    fixture.componentInstance.leaveWithoutSaving();

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([1]);
    expect(navigateByUrl).toHaveBeenCalledWith('/my-team');
  });

  it('stayHere() just closes the leave-confirm dialog', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    inst.teamDraft.set([mon(2)]);
    fixture.componentInstance.goBackToMyTeam();

    fixture.componentInstance.stayHere();

    expect(inst.showLeaveConfirm()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('compareCandidates() offers favorites for team-vs-favorites mode, and saved team members for favorite-vs-team', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(2)] });
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.compareTeamAgainstFavorites(1);
    expect(inst.compareCandidates().map((c: any) => c.pokemonId)).toEqual([2]);

    fixture.componentInstance.compareFavoriteAgainstTeam(2);
    expect(inst.compareCandidates().map((c: any) => c.pokemonId)).toEqual([1]);
  });

  it('closeCompare() clears the compare anchor', () => {
    const fixture = setup({ team: [mon(1)] });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.compareTeamAgainstFavorites(1);
    fixture.componentInstance.closeCompare();
    expect(inst.compareAnchorId()).toBeNull();
  });

  it('onCompareSwapped() moves the incoming favorite into the draft team and off the bench, all locally', () => {
    const fixture = setup({ team: [mon(1)], favorites: [mon(2)] });
    const inst = fixture.componentInstance as any;
    inst.benchDraft.set([mon(2)]);

    fixture.componentInstance.onCompareSwapped({ removedPokemonId: 1, addedPokemonId: 2 });

    expect(inst.teamDraft().map((m: any) => m.pokemonId)).toEqual([2]);
    expect(inst.benchDraft()).toEqual([]);
    expect(inst.compareAnchorId()).toBeNull();
  });

  it('scoutStatsFor() reads the real stat values and flags which side wins each row', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.scoutA.set(mon(1, { stats: [{ name: 'hp', value: 100 }, { name: 'attack', value: 10 }, { name: 'defense', value: 10 }] }));
    inst.scoutB.set(mon(2, { stats: [{ name: 'hp', value: 50 }, { name: 'attack', value: 10 }, { name: 'defense', value: 10 }] }));

    const rows = fixture.componentInstance.scoutStatsFor(0);
    const hpRow = rows.find((r) => r.label === 'HP');
    expect(hpRow?.wins).toBe(true);
    expect(hpRow?.value).toBe(100);
  });

  it('onScoutDrop()/clearScout() stage and clear the scouted comparison sides', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.startDrag(mon(5), 'fav');

    fixture.componentInstance.onScoutDrop(0);
    expect(inst.scoutA()?.pokemonId).toBe(5);

    fixture.componentInstance.clearScout(0);
    expect(inst.scoutA()).toBeNull();
  });
});
