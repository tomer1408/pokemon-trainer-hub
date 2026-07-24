import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PokemonSummary, PokemonService, TypeChart } from '../../core/pokemon';
import { TeamService } from '../../core/team';
import { ComparablePokemon } from '../team-swap-modal/team-swap-modal';
import { SurpriseTeamModal } from './surprise-team-modal';

describe('SurpriseTeamModal', () => {
  let saveTeam: ReturnType<typeof vi.fn>;

  function mon(overrides: Partial<PokemonSummary> = {}): PokemonSummary {
    return { id: 25, name: 'pikachu', baseExperience: 112, types: ['electric'], spriteUrl: 's', stats: [], ...overrides };
  }

  function teammate(id: number, overrides: Partial<ComparablePokemon> = {}): ComparablePokemon {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', types: ['water'], baseExperience: 200, stats: [], ...overrides };
  }

  // Only exercised by the nested TeamSwapModal, which self-fetches its
  // anchor via getById() — needs every PokemonDetail field so that
  // component's own template doesn't crash on a missing one.
  function anchorDetail() {
    return {
      id: 9,
      name: 'anchor',
      baseExperience: 100,
      types: ['normal'],
      spriteUrl: 's',
      stats: [],
      abilities: [],
      cry: null,
      height: 1,
      weight: 1,
      flavorText: null,
      weaknesses: [],
      resistances: [],
      topMoves: [],
    };
  }

  const chart: TypeChart = {
    fire: { weak: ['water'], resist: ['grass'], strong: ['grass'] },
    water: { weak: ['grass'], resist: ['fire'], strong: ['fire'] },
  };

  function setup(
    picks: PokemonSummary[] = [mon()],
    options: {
      isLoading?: boolean;
      usedFallback?: boolean;
      typeChart?: TypeChart;
      myTeam?: ComparablePokemon[];
      saveTeamResult?: any;
    } = {},
  ) {
    saveTeam = vi.fn(() => of(options.saveTeamResult ?? { ok: true, team: [] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TeamService, useValue: { saveTeam, swapTeamMember: vi.fn(() => of({ ok: true })) } },
        { provide: PokemonService, useValue: { getById: vi.fn(() => of(anchorDetail())) } },
      ],
    });
    const fixture = TestBed.createComponent(SurpriseTeamModal);
    fixture.componentInstance.picks = picks;
    fixture.componentInstance.isLoading = options.isLoading ?? false;
    fixture.componentInstance.usedFallback = options.usedFallback ?? false;
    fixture.componentInstance.typeChart = options.typeChart ?? chart;
    fixture.componentInstance.myTeam = options.myTeam ?? [];
    fixture.detectChanges();
    return fixture;
  }

  it('onCancel() emits closed', () => {
    const fixture = setup();
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));

    fixture.componentInstance.onCancel();

    expect(closed).toBe(true);
  });

  it('typeColor() falls back to the normal color for an unknown type', () => {
    const fixture = setup();
    expect(fixture.componentInstance.typeColor('not-a-type')).toBe(fixture.componentInstance.typeColor('normal'));
  });

  it('renders a card per pick and emits pickSelected with the real Pokémon on click', () => {
    const picks = [mon({ id: 1, name: 'bulbasaur' }), mon({ id: 4, name: 'charmander' })];
    const fixture = setup(picks);
    let selected: PokemonSummary | undefined;
    fixture.componentInstance.pickSelected.subscribe((p) => (selected = p));

    const cards = fixture.nativeElement.querySelectorAll('.pick-card');
    expect(cards.length).toBe(2);
    cards[1].click();

    expect(selected).toEqual(picks[1]);
  });

  it('shows the empty state and no cards when there are no picks left', () => {
    const fixture = setup([]);
    expect(fixture.nativeElement.querySelector('.pick-card')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("you've caught them all");
  });

  it('shows the loading state instead of the grid while isLoading is true', () => {
    const fixture = setup([mon()], { isLoading: true });

    expect(fixture.nativeElement.querySelector('.pick-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-loading-screen')).toBeTruthy();
  });

  it('shows the fallback note only when usedFallback is true', () => {
    const withoutFallback = setup();
    expect(withoutFallback.nativeElement.querySelector('.fallback-note')).toBeNull();

    const withFallback = setup([mon()], { usedFallback: true });
    expect(withFallback.nativeElement.querySelector('.fallback-note')).toBeTruthy();
  });

  it('shuffle button emits shuffle and is disabled while loading', () => {
    const fixture = setup();
    let shuffled = false;
    fixture.componentInstance.shuffle.subscribe(() => (shuffled = true));

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.shuffle-btn');
    btn.click();
    expect(shuffled).toBe(true);

    const loadingFixture = setup([mon()], { isLoading: true });
    const loadingBtn: HTMLButtonElement = loadingFixture.nativeElement.querySelector('.shuffle-btn');
    expect(loadingBtn.disabled).toBe(true);
  });

  it('pickedPower()/pickedMatchup() use the real shared team-power/team-matchup calculations', () => {
    const picks = [mon({ id: 1, types: ['fire'], baseExperience: 100 }), mon({ id: 2, types: ['water'], baseExperience: 50 })];
    const fixture = setup(picks);
    const inst = fixture.componentInstance as any;

    expect(inst.pickedPower()).toBe(150);
    expect(inst.pickedMatchup().strongAgainst.sort()).toEqual(['fire', 'grass'].sort());
  });

  it('shows a strength line, a weakness line, and the real type mix', () => {
    const picks = [mon({ id: 1, types: ['fire'], baseExperience: 100 })];
    const fixture = setup(picks);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Strength:');
    expect(text).toContain('Weakness:');
    expect(fixture.nativeElement.querySelector('.mix-row .type-pill')?.textContent).toContain('fire');
  });

  it('toggleComparison() reveals a side-by-side comparison against the real myTeam input', () => {
    const picks = [mon({ id: 1, types: ['fire'], baseExperience: 100 })];
    const myTeam = [teammate(9, { types: ['water'], baseExperience: 200 })];
    const fixture = setup(picks, { myTeam });

    expect(fixture.nativeElement.querySelector('.comparison-grid')).toBeNull();

    fixture.componentInstance.toggleComparison();
    fixture.detectChanges();

    const cols = fixture.nativeElement.querySelectorAll('.comparison-col');
    expect(cols.length).toBe(2);
    expect(cols[0].textContent).toContain('PWR 100');
    expect(cols[1].textContent).toContain('PWR 200');
  });

  it('shows "Your team is empty" in the comparison when myTeam has no members', () => {
    const fixture = setup([mon()], { myTeam: [] });

    fixture.componentInstance.toggleComparison();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Your team is empty');
  });

  it('requestReplaceTeam() opens a confirm, cancelReplaceTeam() closes it without calling saveTeam', () => {
    const fixture = setup([mon({ id: 1 }), mon({ id: 2 })]);
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.requestReplaceTeam();
    expect(inst.confirmingReplace()).toBe(true);

    fixture.componentInstance.cancelReplaceTeam();
    expect(inst.confirmingReplace()).toBe(false);
    expect(saveTeam).not.toHaveBeenCalled();
  });

  it('confirmReplaceTeam() saves exactly the picked ids and emits teamChanged + closed on success', () => {
    const picks = [mon({ id: 1 }), mon({ id: 2 }), mon({ id: 3 })];
    const fixture = setup(picks);
    let replaced = false;
    let closed = false;
    fixture.componentInstance.teamChanged.subscribe(() => (replaced = true));
    fixture.componentInstance.closed.subscribe(() => (closed = true));

    fixture.componentInstance.requestReplaceTeam();
    fixture.componentInstance.confirmReplaceTeam();

    expect(saveTeam).toHaveBeenCalledWith([1, 2, 3]);
    expect(replaced).toBe(true);
    expect(closed).toBe(true);
  });

  it('confirmReplaceTeam() keeps the dialog open and shows the real error on failure', () => {
    const fixture = setup([mon({ id: 1 })], { saveTeamResult: { ok: false, message: 'A Dream Team can have at most 5 members.' } });
    const inst = fixture.componentInstance as any;
    let replaced = false;
    fixture.componentInstance.teamChanged.subscribe(() => (replaced = true));

    fixture.componentInstance.requestReplaceTeam();
    fixture.componentInstance.confirmReplaceTeam();

    expect(inst.confirmingReplace()).toBe(true);
    expect(inst.replaceError()).toBe('A Dream Team can have at most 5 members.');
    expect(replaced).toBe(false);
  });

  it('requestReplaceTeam() does nothing when there are no picks', () => {
    const fixture = setup([]);
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.requestReplaceTeam();

    expect(inst.confirmingReplace()).toBe(false);
  });

  it('pickCandidates() reshapes picks into the same ComparablePokemon shape Manage My Team uses', () => {
    const picks = [mon({ id: 6, name: 'charizard', types: ['fire', 'flying'], baseExperience: 240 })];
    const fixture = setup(picks);

    expect((fixture.componentInstance as any).pickCandidates()).toEqual([
      { pokemonId: 6, pokemonName: 'charizard', spriteUrl: 's', types: ['fire', 'flying'], baseExperience: 240, stats: [] },
    ]);
  });

  it('clicking a teammate\'s Compare button opens the head-to-head against this roll\'s picks', () => {
    const myTeam = [teammate(9, { pokemonName: 'squirtle' })];
    const fixture = setup([mon({ id: 1 })], { myTeam });

    fixture.componentInstance.toggleComparison();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-team-swap-modal')).toBeNull();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.teammate-compare-btn');
    btn.click();
    fixture.detectChanges();

    expect((fixture.componentInstance as any).compareAnchorId()).toBe(9);
    expect(fixture.nativeElement.querySelector('app-team-swap-modal')).toBeTruthy();
  });

  it('closeTeammateCompare() clears the anchor without emitting teamChanged', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    let changed = false;
    fixture.componentInstance.teamChanged.subscribe(() => (changed = true));

    fixture.componentInstance.openTeammateCompare(9);
    expect(inst.compareAnchorId()).toBe(9);

    fixture.componentInstance.closeTeammateCompare();
    expect(inst.compareAnchorId()).toBeNull();
    expect(changed).toBe(false);
  });

  it('onTeammateSwapped() clears the anchor and emits teamChanged', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    let changed = false;
    fixture.componentInstance.teamChanged.subscribe(() => (changed = true));

    fixture.componentInstance.openTeammateCompare(9);
    fixture.componentInstance.onTeammateSwapped();

    expect(inst.compareAnchorId()).toBeNull();
    expect(changed).toBe(true);
  });
});
