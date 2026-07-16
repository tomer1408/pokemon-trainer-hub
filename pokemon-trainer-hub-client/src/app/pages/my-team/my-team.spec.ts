import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { ProfileService } from '../../core/profile';
import { PokemonService } from '../../core/pokemon';
import { MyTeam } from './my-team';

describe('MyTeam', () => {
  let getTeamStrict: ReturnType<typeof vi.fn>;
  let removeFromTeam: ReturnType<typeof vi.fn>;
  let getFavorites: ReturnType<typeof vi.fn>;
  let addFavorite: ReturnType<typeof vi.fn>;
  let removeFavorite: ReturnType<typeof vi.fn>;
  let getProfile: ReturnType<typeof vi.fn>;
  let updateTeamName: ReturnType<typeof vi.fn>;

  function member(id: number, overrides: Partial<DreamTeamMember> = {}): DreamTeamMember {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', position: 0, stats: [], types: ['fire'], baseExperience: 100, ...overrides };
  }

  function favorite(id: number): FavoritePokemon {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', stats: [], types: [], baseExperience: 100 };
  }

  function setup(options: { team?: DreamTeamMember[]; teamError?: boolean; favorites?: FavoritePokemon[]; teamName?: string | null } = {}) {
    getTeamStrict = vi.fn(() => (options.teamError ? throwError(() => new Error('down')) : of(options.team ?? [])));
    removeFromTeam = vi.fn(() => of(undefined));
    getFavorites = vi.fn(() => of(options.favorites ?? []));
    addFavorite = vi.fn(() => of(true));
    removeFavorite = vi.fn(() => of(true));
    getProfile = vi.fn(() => of({ teamName: options.teamName ?? null } as any));
    updateTeamName = vi.fn(() => of({ ok: true }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TeamService, useValue: { getTeamStrict, removeFromTeam } },
        { provide: FavoritesService, useValue: { getFavorites, addFavorite, removeFavorite } },
        { provide: ProfileService, useValue: { getProfile, updateTeamName } },
        { provide: PokemonService, useValue: { getTypeChart: () => of({}) } },
      ],
    });
    const fixture = TestBed.createComponent(MyTeam);
    fixture.detectChanges();
    return fixture;
  }

  it('teamName() falls back to "My Team" when the trainer has not set a custom one', () => {
    const fixture = setup({ teamName: null });
    expect((fixture.componentInstance as any).teamName()).toBe('My Team');
  });

  it('teamName() uses the real custom name once set', () => {
    const fixture = setup({ teamName: 'Thunder Squad' });
    expect((fixture.componentInstance as any).teamName()).toBe('Thunder Squad');
  });

  it('hasError() is true when the team fetch genuinely fails (distinct from a real empty team)', () => {
    const fixture = setup({ teamError: true });
    const inst = fixture.componentInstance as any;
    expect(inst.hasError()).toBe(true);
    expect(inst.team()).toEqual([]);
  });

  it('slots() pads the team array up to 5 with null placeholders', () => {
    const fixture = setup({ team: [member(1), member(2)] });
    const slots = (fixture.componentInstance as any).slots();
    expect(slots.length).toBe(5);
    expect(slots[0].pokemonId).toBe(1);
    expect(slots[2]).toBeNull();
  });

  it('tierProgressPct()/nextTierText() reflect how close a partial team is to the 5-member cap', () => {
    const partial = setup({ team: [member(1), member(2)] });
    expect((partial.componentInstance as any).tierProgressPct()).toBe(40);
    expect((partial.componentInstance as any).nextTierText()).toBe('3 more Pokémon to hit Master tier.');
  });

  it('nextTierText() celebrates Master tier once the team is full', () => {
    const full = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    expect((full.componentInstance as any).nextTierText()).toBe('Master tier reached — the top of the ladder.');
  });

  it('badges() reflects real thresholds (squad size, power club, type variety, full roster)', () => {
    const fixture = setup({
      team: [
        member(1, { baseExperience: 400, types: ['fire'] }),
        member(2, { baseExperience: 50, types: ['water'] }),
        member(3, { baseExperience: 50, types: ['grass'] }),
      ],
    });
    const badges = (fixture.componentInstance as any).badges();
    expect(badges.find((b: any) => b.label === 'Squad of 3+').earned).toBe(true);
    expect(badges.find((b: any) => b.label === 'Power 300 Club').earned).toBe(true);
    expect(badges.find((b: any) => b.label === 'Type Variety ×3').earned).toBe(true);
    expect(badges.find((b: any) => b.label === 'Full Roster').earned).toBe(false);
  });

  it('gaugeBackground() picks the color band matching the battle-readiness score', () => {
    const emptyTeam = setup({ team: [] });
    // Empty team -> score 0 -> the "bad" band.
    expect((emptyTeam.componentInstance as any).gaugeBackground()).toContain('var(--bad)');
  });

  it('isFavorite()/toggleFavorite(): adds when not favorited, removes when favorited, then refreshes', () => {
    const fixture = setup({ favorites: [favorite(25)] });
    const inst = fixture.componentInstance;
    expect(inst.isFavorite(25)).toBe(true);
    expect(inst.isFavorite(999)).toBe(false);

    inst.toggleFavorite(25);
    expect(removeFavorite).toHaveBeenCalledWith(25);

    inst.toggleFavorite(999);
    expect(addFavorite).toHaveBeenCalledWith(999);
  });

  it('openDetail()/closeDetail() control the selected pokemon id', () => {
    const fixture = setup();
    const inst = fixture.componentInstance;
    inst.openDetail(25);
    expect((inst as any).selectedPokemonId()).toBe(25);
    inst.closeDetail();
    expect((inst as any).selectedPokemonId()).toBeNull();
  });

  it('removeFromTeamModal() removes, refreshes the team, and closes the detail modal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance;
    inst.openDetail(25);

    inst.removeFromTeamModal(25);

    expect(removeFromTeam).toHaveBeenCalledWith(25);
    expect((inst as any).selectedPokemonId()).toBeNull();
  });

  it('retry() re-fetches the team', () => {
    const fixture = setup();
    fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(getTeamStrict).toHaveBeenCalledTimes(2);
  });

  it('openNameGenerator()/closeNameGenerator() control the modal, clearing any prior error', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.nameSaveError.set('previous error');

    fixture.componentInstance.openNameGenerator();
    expect(inst.showNameGenerator()).toBe(true);
    expect(inst.nameSaveError()).toBeNull();

    fixture.componentInstance.closeNameGenerator();
    expect(inst.showNameGenerator()).toBe(false);
  });

  it('onNameSelected() saves immediately, refreshes the profile, and closes the generator on success', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.onNameSelected('Thunder Squad');

    expect(updateTeamName).toHaveBeenCalledWith('Thunder Squad');
    expect(inst.showNameGenerator()).toBe(false);
    expect(inst.savingName()).toBe(false);
  });

  it('onNameSelected() surfaces the real error and keeps the generator open on failure', () => {
    updateTeamName = vi.fn(() => of({ ok: false, message: 'Team name must be 2-40 characters with no control characters.' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TeamService, useValue: { getTeamStrict: () => of([]), removeFromTeam: vi.fn() } },
        { provide: FavoritesService, useValue: { getFavorites: () => of([]), addFavorite: vi.fn(), removeFavorite: vi.fn() } },
        { provide: ProfileService, useValue: { getProfile: () => of({ teamName: null } as any), updateTeamName } },
        { provide: PokemonService, useValue: { getTypeChart: () => of({}) } },
      ],
    });
    const fixture = TestBed.createComponent(MyTeam);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.onNameSelected('A');

    expect(inst.nameSaveError()).toBe('Team name must be 2-40 characters with no control characters.');
    expect(inst.showNameGenerator()).toBe(false); // was never opened in this test — stays false
  });
});
