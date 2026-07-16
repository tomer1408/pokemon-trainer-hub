import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { TeamService } from '../../core/team';
import { ComparablePokemon, TeamSwapModal } from './team-swap-modal';

describe('TeamSwapModal', () => {
  let getById: ReturnType<typeof vi.fn>;
  let swapTeamMember: ReturnType<typeof vi.fn>;
  let addToTeam: ReturnType<typeof vi.fn>;

  function anchorDetail(overrides: Partial<PokemonDetail> = {}): PokemonDetail {
    return {
      id: 6,
      name: 'charizard',
      baseExperience: 240,
      types: ['fire'],
      spriteUrl: 's',
      stats: [{ name: 'hp', value: 78 }, { name: 'attack', value: 84 }],
      abilities: [],
      cry: null,
      height: 17,
      weight: 905,
      flavorText: null,
      weaknesses: [],
      resistances: [],
      topMoves: [],
      ...overrides,
    };
  }

  function candidate(id: number, overrides: Partial<ComparablePokemon> = {}): ComparablePokemon {
    return {
      pokemonId: id,
      pokemonName: `mon-${id}`,
      spriteUrl: 's',
      types: ['water'],
      baseExperience: 100,
      stats: [{ name: 'hp', value: 50 }, { name: 'attack', value: 50 }],
      ...overrides,
    };
  }

  function setup(inputs: {
    selectedPokemonId?: number;
    comparisonCandidates?: ComparablePokemon[];
    mode?: TeamSwapModal['mode'];
    persistImmediately?: boolean;
    anchor?: PokemonDetail | null;
    swapResult?: any;
  } = {}) {
    getById = vi.fn(() => of(inputs.anchor === undefined ? anchorDetail() : inputs.anchor));
    swapTeamMember = vi.fn(() => of(inputs.swapResult ?? ({ ok: true } as any)));
    addToTeam = vi.fn(() => of({ ok: true } as any));

    TestBed.configureTestingModule({
      providers: [
        { provide: PokemonService, useValue: { getById } },
        { provide: TeamService, useValue: { swapTeamMember, addToTeam } },
      ],
    });

    const fixture = TestBed.createComponent(TeamSwapModal);
    // @Input()-bound properties must go through setInput() (not direct
    // assignment) so Angular actually fires ngOnChanges — that's what
    // triggers loadAnchor().
    fixture.componentRef.setInput('selectedPokemonId', inputs.selectedPokemonId ?? 6);
    fixture.componentRef.setInput('comparisonCandidates', inputs.comparisonCandidates ?? [candidate(1), candidate(2)]);
    fixture.componentRef.setInput('mode', inputs.mode ?? 'overflow');
    fixture.componentRef.setInput('persistImmediately', inputs.persistImmediately ?? true);
    fixture.detectChanges(); // triggers ngOnChanges -> loadAnchor()
    return fixture;
  }

  it('loads the anchor via PokemonService on init and flags a failed load when null', () => {
    const fixture = setup({ anchor: null });
    const inst = fixture.componentInstance as any;
    expect(getById).toHaveBeenCalledWith(6);
    expect(inst.anchor()).toBeNull();
    expect(inst.anchorLoadFailed()).toBe(true);
  });

  it('retryLoadAnchor() clears the failure flag and reloads', () => {
    const fixture = setup({ anchor: null });
    const inst = fixture.componentInstance as any;
    getById.mockReturnValue(of(anchorDetail()));

    inst.retryLoadAnchor();

    expect(inst.anchorLoadFailed()).toBe(false);
    expect(inst.anchor()).toEqual(anchorDetail());
  });

  it('suggestedMember() picks the weakest candidate by default (for swap-out)', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1, { baseExperience: 300 }), candidate(2, { baseExperience: 50 })] });
    expect((fixture.componentInstance as any).suggestedMember().pokemonId).toBe(2);
  });

  it('suggestedMember() picks the strongest candidate for team-vs-favorites (best pickup)', () => {
    const fixture = setup({
      mode: 'team-vs-favorites',
      comparisonCandidates: [candidate(1, { baseExperience: 300 }), candidate(2, { baseExperience: 50 })],
    });
    expect((fixture.componentInstance as any).suggestedMember().pokemonId).toBe(1);
  });

  it('suggestedMember() is null for an empty candidate list', () => {
    const fixture = setup({ comparisonCandidates: [] });
    expect((fixture.componentInstance as any).suggestedMember()).toBeNull();
  });

  it('pickCandidate()/pickedMember()/hasSelection() track the current pick', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.hasSelection()).toBe(false);

    inst.pickCandidate(1);

    expect(inst.pickedMember().pokemonId).toBe(1);
    expect(inst.hasSelection()).toBe(true);
  });

  it('useSuggestion() picks the suggested candidate', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1, { baseExperience: 300 }), candidate(2, { baseExperience: 50 })] });
    (fixture.componentInstance as any).useSuggestion();
    expect((fixture.componentInstance as any).pickedId()).toBe(2);
  });

  it('statRows() marks the higher stat as the winner on each row', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1, { stats: [{ name: 'hp', value: 999 }, { name: 'attack', value: 1 }] })] });
    (fixture.componentInstance as any).pickCandidate(1);

    const rows = (fixture.componentInstance as any).statRows();
    const hpRow = rows.find((r: any) => r.label === 'HP');
    const atkRow = rows.find((r: any) => r.label === 'ATK');

    expect(hpRow.selectedWins).toBe(true);
    expect(hpRow.candidateWins).toBe(false);
    expect(atkRow.candidateWins).toBe(true);
  });

  it('statRows() shows every candidate row losing (no false wins) when the picked candidate has no stats loaded', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1, { stats: [] })] });
    (fixture.componentInstance as any).pickCandidate(1);

    const rows = (fixture.componentInstance as any).statRows();
    expect(rows.every((r: any) => !r.candidateWins && !r.selectedWins && r.selectedUnavailable)).toBe(true);
  });

  it('powerDiff() is the anchor\'s baseExperience minus the picked candidate\'s', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1, { baseExperience: 40 })] }); // anchor is 240
    (fixture.componentInstance as any).pickCandidate(1);
    expect((fixture.componentInstance as any).powerDiff()).toBe(200);
  });

  it('statFillPct() caps at 100 for very high stat values', () => {
    const fixture = setup();
    expect((fixture.componentInstance as any).statFillPct(999)).toBe(100);
    expect((fixture.componentInstance as any).statFillPct(75)).toBe(50);
  });

  it('headerKicker() differs for overflow vs compare mode', () => {
    expect((setup({ mode: 'overflow' }).componentInstance as any).headerKicker()).toBe("Team's full — 5/5");
  });

  it('headerKicker() reads "Compare & decide" for compare mode', () => {
    expect((setup({ mode: 'compare' }).componentInstance as any).headerKicker()).toBe('Compare & decide');
  });

  it('anchorKicker() differs for team-vs-favorites vs favorite-vs-team', () => {
    expect((setup({ mode: 'team-vs-favorites' }).componentInstance as any).anchorKicker()).toBe('Your Pokémon');
  });

  it('anchorKicker() reads "Your Favorite" for favorite-vs-team mode', () => {
    expect((setup({ mode: 'favorite-vs-team' }).componentInstance as any).anchorKicker()).toBe('Your Favorite');
  });

  it('addName/removeName: in overflow mode, the anchor joins and the picked candidate leaves', () => {
    const overflow = setup({ mode: 'overflow', comparisonCandidates: [candidate(1)] });
    (overflow.componentInstance as any).pickCandidate(1);
    expect((overflow.componentInstance as any).addName()).toBe('charizard');
    expect((overflow.componentInstance as any).removeName()).toBe('mon-1');
  });

  it('addName/removeName: in team-vs-favorites mode, the picked favorite joins and the anchor (team member) leaves', () => {
    const tvf = setup({ mode: 'team-vs-favorites', comparisonCandidates: [candidate(1)] });
    (tvf.componentInstance as any).pickCandidate(1);
    expect((tvf.componentInstance as any).addName()).toBe('mon-1');
    expect((tvf.componentInstance as any).removeName()).toBe('charizard');
  });

  it('onCancel() emits closed', () => {
    const fixture = setup();
    let emitted = false;
    fixture.componentInstance.closed.subscribe(() => (emitted = true));
    fixture.componentInstance.onCancel();
    expect(emitted).toBe(true);
  });

  it('requestSwap() is a no-op without a selection', () => {
    const fixture = setup();
    (fixture.componentInstance as any).requestSwap();
    expect((fixture.componentInstance as any).confirmingSwap()).toBe(false);
  });

  it('requestSwap() opens the confirm step once something is picked; cancelSwapConfirm() closes it', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1)] });
    const inst = fixture.componentInstance as any;
    inst.pickCandidate(1);
    inst.requestSwap();
    expect(inst.confirmingSwap()).toBe(true);
    inst.cancelSwapConfirm();
    expect(inst.confirmingSwap()).toBe(false);
  });

  it('confirmSwap() with persistImmediately=false emits swapped locally without calling the backend', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1)], persistImmediately: false });
    const inst = fixture.componentInstance as any;
    inst.pickCandidate(1);
    let payload: any;
    fixture.componentInstance.swapped.subscribe((p) => (payload = p));

    inst.confirmSwap();

    expect(swapTeamMember).not.toHaveBeenCalled();
    expect(payload).toEqual({ removedPokemonId: 1, addedPokemonId: 6 });
  });

  it('confirmSwap() calls the real backend and emits swapped on success', () => {
    const fixture = setup({ comparisonCandidates: [candidate(1)] });
    const inst = fixture.componentInstance as any;
    inst.pickCandidate(1);
    let payload: any;
    fixture.componentInstance.swapped.subscribe((p) => (payload = p));

    inst.confirmSwap();

    expect(swapTeamMember).toHaveBeenCalledWith(1, 6);
    expect(payload).toEqual({ removedPokemonId: 1, addedPokemonId: 6 });
    expect(inst.isSwapping()).toBe(false);
  });

  it('confirmSwap() surfaces the server error via swapError on failure, without emitting swapped', () => {
    const fixture = setup({
      comparisonCandidates: [candidate(1)],
      swapResult: { ok: false, reason: 'DUPLICATE', message: 'Already on your team.' },
    });
    const inst = fixture.componentInstance as any;
    inst.pickCandidate(1);
    let emitted = false;
    fixture.componentInstance.swapped.subscribe(() => (emitted = true));

    inst.confirmSwap();

    expect(emitted).toBe(false);
    expect(inst.swapError()).toBe('Already on your team.');
  });

  it('confirmAdd() calls addToTeam and emits added on success', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    let payload: any;
    fixture.componentInstance.added.subscribe((p) => (payload = p));

    inst.confirmAdd();

    expect(addToTeam).toHaveBeenCalledWith(6);
    expect(payload).toEqual({ addedPokemonId: 6 });
  });
});
