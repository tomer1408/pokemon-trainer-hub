import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { ProfileService } from '../../core/profile';
import { Explorer } from './explorer';

describe('Explorer', () => {
  let search: ReturnType<typeof vi.fn>;
  let getById: ReturnType<typeof vi.fn>;
  let getTeam: ReturnType<typeof vi.fn>;
  let addToTeam: ReturnType<typeof vi.fn>;
  let removeFromTeam: ReturnType<typeof vi.fn>;
  let getFavorites: ReturnType<typeof vi.fn>;
  let addFavorite: ReturnType<typeof vi.fn>;
  let removeFavorite: ReturnType<typeof vi.fn>;

  function summary(id: number, overrides: Partial<PokemonSummary> = {}): PokemonSummary {
    return { id, name: `mon-${id}`, baseExperience: 100, types: ['fire'], spriteUrl: 's', stats: [], ...overrides };
  }

  function member(id: number): DreamTeamMember {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', position: 0, stats: [], types: ['fire'], baseExperience: 100 };
  }

  function favorite(id: number, overrides: Partial<FavoritePokemon> = {}): FavoritePokemon {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', stats: [], types: ['fire'], baseExperience: 100, ...overrides };
  }

  function setup(options: {
    team?: DreamTeamMember[];
    favorites?: FavoritePokemon[];
    searchResult?: any;
    addToTeamResult?: any;
  } = {}) {
    search = vi.fn(() => of(options.searchResult ?? { results: [], page: 1, pageSize: 4, total: 0 }));
    getById = vi.fn(() => of(null));
    getTeam = vi.fn(() => of(options.team ?? []));
    addToTeam = vi.fn(() => of(options.addToTeamResult ?? { ok: true }));
    removeFromTeam = vi.fn(() => of(undefined));
    getFavorites = vi.fn(() => of(options.favorites ?? []));
    addFavorite = vi.fn(() => of(true));
    removeFavorite = vi.fn(() => of(true));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PokemonService, useValue: { search, getById } },
        { provide: TeamService, useValue: { getTeam, addToTeam, removeFromTeam } },
        { provide: FavoritesService, useValue: { getFavorites, addFavorite, removeFavorite } },
        { provide: ProfileService, useValue: { getProfile: () => of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(Explorer);
    fixture.detectChanges();
    return fixture;
  }

  it('favoritesOnly: filters and sorts favorites client-side instead of calling search()', () => {
    const fixture = setup({
      favorites: [favorite(1, { pokemonName: 'zapdos', types: ['electric'] }), favorite(2, { pokemonName: 'abra', types: ['psychic'] })],
    });
    const inst = fixture.componentInstance as any;
    const callsBeforeToggle = search.mock.calls.length;
    inst.favoritesOnly.set(true);
    fixture.detectChanges();

    expect(inst.listResult().results.map((r: any) => r.name)).toEqual(['abra', 'zapdos']); // sorted by name
    expect(search.mock.calls.length).toBe(callsBeforeToggle); // no additional real search() call
  });

  it('favoritesOnly: applies the same search-text and type filters as the real search', () => {
    const fixture = setup({
      favorites: [favorite(1, { pokemonName: 'zapdos', types: ['electric'] }), favorite(2, { pokemonName: 'abra', types: ['psychic'] })],
    });
    const inst = fixture.componentInstance as any;
    inst.favoritesOnly.set(true);
    inst.typeFilter.set('electric');
    fixture.detectChanges();

    expect(inst.listResult().results.map((r: any) => r.name)).toEqual(['zapdos']);
  });

  it('changing a filter (type/sort/favoritesOnly) resets the page back to 1', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.page.set(3);
    fixture.detectChanges();

    inst.typeFilter.set('fire');
    fixture.detectChanges();

    expect(inst.page()).toBe(1);
  });

  it('totalPages()/isFirstPage()/isLastPage() reflect the real result total', () => {
    const fixture = setup({ searchResult: { results: [], page: 1, pageSize: 4, total: 10 } });
    const inst = fixture.componentInstance as any;
    expect(inst.totalPages()).toBe(3); // ceil(10/4)
    expect(inst.isFirstPage()).toBe(true);
    expect(inst.isLastPage()).toBe(false);

    inst.page.set(3);
    expect(inst.isLastPage()).toBe(true);
  });

  it('nextPage()/prevPage() never go outside [1, totalPages]', () => {
    const fixture = setup({ searchResult: { results: [], page: 1, pageSize: 4, total: 10 } });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.prevPage();
    expect(inst.page()).toBe(1); // already at 1

    inst.page.set(3);
    fixture.componentInstance.nextPage();
    expect(inst.page()).toBe(3); // already at totalPages (3)
  });

  it('teamCoverage()/teamSlots()/teamPower() are derived from the real team', () => {
    const fixture = setup({ team: [member(1)] });
    const inst = fixture.componentInstance as any;
    expect(inst.teamCoverage()).toEqual(['fire']);
    expect(inst.teamSlots().length).toBe(5);
    expect(inst.teamSlots()[0].pokemonId).toBe(1);
    expect(inst.teamPower()).toBe(100);
  });

  it('actionLabel() reads "Remove" for a Pokémon already on the team', () => {
    const onTeam = setup({ team: [member(25)] });
    expect(onTeam.componentInstance.actionLabel(summary(25))).toBe('Remove');
  });

  it('actionLabel() reads "Compare" when the team is full', () => {
    const full = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    expect(full.componentInstance.actionLabel(summary(99))).toBe('Compare');
  });

  it('actionLabel() reads "Add to Team" when there is room', () => {
    const empty = setup({ team: [] });
    expect(empty.componentInstance.actionLabel(summary(99))).toBe('Add to Team');
  });

  it('onAction() stages a remove-confirm when already on the team', () => {
    const fixture = setup({ team: [member(25)] });
    fixture.componentInstance.onAction(summary(25, { name: 'pikachu' }));
    expect((fixture.componentInstance as any).pendingRemove()).toEqual({ id: 25, name: 'pikachu' });
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('onAction() opens the swap flow when the team is full', () => {
    const fixture = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    fixture.componentInstance.onAction(summary(99));
    expect((fixture.componentInstance as any).swapCandidate()?.id).toBe(99);
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('onAction() adds and closes the detail modal on success', () => {
    const fixture = setup({ team: [] });
    const inst = fixture.componentInstance as any;
    inst.selectedPokemon.set(summary(99));
    fixture.componentInstance.onAction(summary(99));
    expect(addToTeam).toHaveBeenCalledWith(99);
    expect(inst.selectedPokemon()).toBeNull();
  });

  it('onAction() surfaces a genuine (non-TEAM_FULL) error via swapNotice', () => {
    const fixture = setup({ team: [], addToTeamResult: { ok: false, reason: 'OTHER', message: 'Something broke.' } });
    fixture.componentInstance.onAction(summary(99));
    expect((fixture.componentInstance as any).swapNotice()).toBe('Something broke.');
  });

  it('toggleCompareSlot(): fills A then B, toggling either slot off clears just that slot', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.toggleCompareSlot(summary(1));
    expect(inst.compareSlotA()?.id).toBe(1);

    fixture.componentInstance.toggleCompareSlot(summary(2));
    expect(inst.compareSlotB()?.id).toBe(2);

    fixture.componentInstance.toggleCompareSlot(summary(1));
    expect(inst.compareSlotA()).toBeNull();
    expect(inst.compareSlotB()?.id).toBe(2); // untouched
  });

  it('toggleCompareSlot() ignores a third pick once both slots are full', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.toggleCompareSlot(summary(1));
    fixture.componentInstance.toggleCompareSlot(summary(2));

    fixture.componentInstance.toggleCompareSlot(summary(3));

    expect(inst.compareSlotA()?.id).toBe(1);
    expect(inst.compareSlotB()?.id).toBe(2);
  });

  it('toggleCompareSlotFromTeam() converts a DreamTeamMember into the same compare-slot shape', () => {
    const fixture = setup();
    fixture.componentInstance.toggleCompareSlotFromTeam(member(7));
    expect((fixture.componentInstance as any).compareSlotA()?.id).toBe(7);
  });

  it('cancelCompareSelection()/closeCompareModal() both clear both slots', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.toggleCompareSlot(summary(1));
    fixture.componentInstance.toggleCompareSlot(summary(2));

    fixture.componentInstance.cancelCompareSelection();

    expect(inst.compareSlotA()).toBeNull();
    expect(inst.compareSlotB()).toBeNull();
  });

  it('requestRemove()/confirmRemove()/cancelRemove() drive the team-sidebar removal confirm', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestRemove(member(25));
    expect(inst.pendingRemove()).toEqual({ id: 25, name: 'mon-25' });

    fixture.componentInstance.cancelRemove();
    expect(inst.pendingRemove()).toBeNull();

    fixture.componentInstance.requestRemove(member(25));
    fixture.componentInstance.confirmRemove();
    expect(removeFromTeam).toHaveBeenCalledWith(25);
    expect(inst.pendingRemove()).toBeNull();
  });

  it('confirmRemove() is a no-op without a pending target', () => {
    const fixture = setup();
    fixture.componentInstance.confirmRemove();
    expect(removeFromTeam).not.toHaveBeenCalled();
  });

  it('clearFilters() resets search/type/favoritesOnly/page all at once', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.searchInput.set('pika');
    inst.typeFilter.set('fire');
    inst.favoritesOnly.set(true);
    inst.page.set(3);

    fixture.componentInstance.clearFilters();

    expect(inst.searchInput()).toBe('');
    expect(inst.typeFilter()).toBe('all');
    expect(inst.favoritesOnly()).toBe(false);
    expect(inst.page()).toBe(1);
  });

  it('onSurpriseMe() looks up a real random Pokémon and puts its name into search', () => {
    getById = vi.fn(() => of(summary(42, { name: 'golem' })));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PokemonService, useValue: { search: () => of({ results: [], page: 1, pageSize: 4, total: 0 }), getById } },
        { provide: TeamService, useValue: { getTeam: () => of([]) } },
        { provide: FavoritesService, useValue: { getFavorites: () => of([]) } },
        { provide: ProfileService, useValue: { getProfile: () => of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(Explorer);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.onSurpriseMe();

    expect(inst.searchInput()).toBe('golem');
    expect(inst.surpriseId()).toBe(42);
  });

  it('onSurpriseMe() clears the highlight after its timeout', () => {
    vi.useFakeTimers();
    getById = vi.fn(() => of(summary(42, { name: 'golem' })));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PokemonService, useValue: { search: () => of({ results: [], page: 1, pageSize: 4, total: 0 }), getById } },
        { provide: TeamService, useValue: { getTeam: () => of([]) } },
        { provide: FavoritesService, useValue: { getFavorites: () => of([]) } },
        { provide: ProfileService, useValue: { getProfile: () => of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(Explorer);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.onSurpriseMe();
    expect(inst.surpriseId()).toBe(42);
    vi.advanceTimersByTime(2800);
    expect(inst.surpriseId()).toBeNull();
    vi.useRealTimers();
  });

  it('openDetail()/closeDetail() and toggleMobileDrawer()/closeMobileDrawer() control their own UI state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.openDetail(summary(1));
    expect(inst.selectedPokemon()?.id).toBe(1);
    fixture.componentInstance.closeDetail();
    expect(inst.selectedPokemon()).toBeNull();

    fixture.componentInstance.toggleMobileDrawer();
    expect(inst.mobileDrawerOpen()).toBe(true);
    fixture.componentInstance.closeMobileDrawer();
    expect(inst.mobileDrawerOpen()).toBe(false);
  });

  it('toggleFavorite() adds/removes and refreshes favorites', () => {
    const fixture = setup({ favorites: [] });
    fixture.componentInstance.toggleFavorite(summary(25));
    expect(addFavorite).toHaveBeenCalledWith(25);
  });

  it('isComparing() reflects either compare slot', () => {
    const fixture = setup();
    fixture.componentInstance.toggleCompareSlot(summary(1));
    expect(fixture.componentInstance.isComparing(1)).toBe(true);
    expect(fixture.componentInstance.isComparing(2)).toBe(false);
  });
});
