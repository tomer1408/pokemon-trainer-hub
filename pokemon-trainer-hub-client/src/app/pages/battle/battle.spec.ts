import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeamService, DreamTeamMember } from '../../core/team';
import { PokemonService, PokemonDetail, PokemonSummary } from '../../core/pokemon';
import { BattleHistoryService } from '../../core/battle-history';
import { Battle } from './battle';

describe('Battle', () => {
  let getTeamStrict: ReturnType<typeof vi.fn>;
  let getById: ReturnType<typeof vi.fn>;
  let search: ReturnType<typeof vi.fn>;
  let recordMatch: ReturnType<typeof vi.fn>;

  function member(id: number, overrides: Partial<DreamTeamMember> = {}): DreamTeamMember {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', position: 0, stats: [], types: ['fire'], baseExperience: 100, ...overrides };
  }

  function detail(id: number, overrides: Partial<PokemonDetail> = {}): PokemonDetail {
    return {
      id, name: `mon-${id}`, baseExperience: 100, types: ['fire'], spriteUrl: 's', stats: [],
      abilities: [], cry: null, height: 1, weight: 1, flavorText: null,
      weaknesses: [], resistances: [], topMoves: [{ name: 'ember', type: 'fire', power: 40 }],
      ...overrides,
    };
  }

  function candidate(id: number, overrides: Partial<PokemonSummary> = {}): PokemonSummary {
    return { id, name: `cand-${id}`, baseExperience: 100, types: ['water'], spriteUrl: 's', stats: [], ...overrides };
  }

  function setup(options: {
    team?: DreamTeamMember[];
    teamError?: boolean;
    detailsById?: Record<number, Partial<PokemonDetail>>;
    candidates?: PokemonSummary[];
  } = {}) {
    getTeamStrict = vi.fn(() => (options.teamError ? throwError(() => new Error('down')) : of(options.team ?? [member(1)])));
    getById = vi.fn((id: number) => of(detail(id, options.detailsById?.[id] ?? {})));
    const candidates = options.candidates ?? Array.from({ length: 10 }, (_, i) => candidate(100 + i));
    search = vi.fn(() => of({ results: candidates, page: 1, pageSize: candidates.length, total: candidates.length }));
    recordMatch = vi.fn(() => of(true));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TeamService, useValue: { getTeamStrict } },
        { provide: PokemonService, useValue: { getById, search } },
        { provide: BattleHistoryService, useValue: { recordMatch } },
      ],
    });
    const fixture = TestBed.createComponent(Battle);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the real team, enriched with weaknesses/resistances/bestMove from PokeAPI', () => {
    const fixture = setup({
      team: [member(1)],
      detailsById: { 1: { weaknesses: ['water'], resistances: ['fire'], topMoves: [{ name: 'flamethrower', type: 'fire', power: 90 }] } },
    });
    const inst = fixture.componentInstance as any;
    expect(inst.isLoading()).toBe(false);
    const mon = inst.yourTeam()[0];
    expect(mon.weaknesses).toEqual(['water']);
    expect(mon.resistances).toEqual(['fire']);
    expect(mon.bestMove).toBe('flamethrower');
  });

  it('handles a genuinely empty team without erroring', () => {
    const fixture = setup({ team: [] });
    const inst = fixture.componentInstance as any;
    expect(inst.hasTeam()).toBe(false);
    expect(inst.isLoading()).toBe(false);
  });

  it('sets hasError() on a genuine team-fetch failure', () => {
    const fixture = setup({ teamError: true });
    expect((fixture.componentInstance as any).hasError()).toBe(true);
  });

  it('retry() reloads the battle', () => {
    const fixture = setup();
    fixture.componentInstance.retry();
    expect(getTeamStrict).toHaveBeenCalledTimes(2);
  });

  it('totalRounds() is capped by the real team size, even if settings ask for more', () => {
    const fixture = setup({ team: [member(1)] }); // team of 1
    const inst = fixture.componentInstance as any;
    inst.settings.update((s: any) => ({ ...s, rounds: 5 }));
    expect(inst.totalRounds()).toBe(1);
  });

  it('requiredWins()/matchDecided()/matchResult() reflect a real Best-of-3 sweep', () => {
    const fixture = setup({ team: [member(1), member(2), member(3)] });
    const inst = fixture.componentInstance as any;
    inst.settings.update((s: any) => ({ ...s, rounds: 3 }));
    expect(inst.requiredWins()).toBe(2);

    inst.roundHistory.set([
      { round: 1, yourMon: {}, oppMon: {}, winner: 'you', reason: 'Type advantage', explanation: '' },
      { round: 2, yourMon: {}, oppMon: {}, winner: 'you', reason: 'Type advantage', explanation: '' },
    ]);

    expect(inst.matchDecided()).toBe(true); // clinched 2 wins before all 3 rounds played
    expect(inst.matchResult()).toBe('win');
    expect(inst.youLeading()).toBe(true);
  });

  it('yourRoundPips()/oppRoundPips() pad unplayed rounds as "pending"', () => {
    const fixture = setup({ team: [member(1), member(2), member(3)] });
    const inst = fixture.componentInstance as any;
    inst.settings.update((s: any) => ({ ...s, rounds: 3 }));
    inst.roundHistory.set([{ round: 1, yourMon: {}, oppMon: {}, winner: 'you', reason: 'Type advantage', explanation: '' }]);

    expect(inst.yourRoundPips()).toEqual(['win', 'pending', 'pending']);
    expect(inst.oppRoundPips()).toEqual(['loss', 'pending', 'pending']);
  });

  it('selectYourMon() refuses to select an already-used Pokémon', () => {
    const fixture = setup({ team: [member(1)] });
    const inst = fixture.componentInstance as any;
    inst.usedYourIds.set(new Set([1]));

    fixture.componentInstance.selectYourMon(1);

    expect(inst.selectedYourId()).toBeNull();
  });

  it('activeMon() prefers the hovered Pokémon over the selected one', () => {
    const fixture = setup({ team: [member(1), member(2)] });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.selectYourMon(1);
    fixture.componentInstance.hoverYourMon(2);

    expect(inst.activeMon()?.pokemonId).toBe(2);

    fixture.componentInstance.unhoverYourMon();
    expect(inst.activeMon()?.pokemonId).toBe(1);
  });

  it('updateSetting()/toggleExplanations() update the real settings signal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.updateSetting('difficulty', 'hard');
    expect(inst.settings().difficulty).toBe('hard');

    const before = inst.settings().showExplanations;
    fixture.componentInstance.toggleExplanations();
    expect(inst.settings().showExplanations).toBe(!before);
  });

  it('summaryChips() renders a human-readable summary of the current settings', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.settings.set({ difficulty: 'hard', rounds: 3, opponentType: 'fire', luckFactor: 'high', showExplanations: true });

    expect(inst.summaryChips()).toEqual(['Hard', 'Best of 3', 'Fire type', 'High luck', 'Explain On']);
  });

  it('beginRound1() is a no-op without a real team', () => {
    const fixture = setup({ team: [] });
    fixture.componentInstance.beginRound1();
    expect((fixture.componentInstance as any).entering()).toBe(false);
  });

  it('beginRound1() only enters the arena once both the countdown and the real opponent are ready', () => {
    vi.useFakeTimers();
    const fixture = setup({ team: [member(1)] });
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.beginRound1();
    expect(inst.entering()).toBe(true);
    expect(inst.phase()).toBe('preview'); // opponent generation + countdown still pending

    vi.advanceTimersByTime(850 * 3); // full countdown elapses
    expect(inst.phase()).toBe('picking'); // opponent already resolved synchronously via mocked observables
    expect(inst.entering()).toBe(false);
    expect(inst.opponentTeam().length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('cancelEnter() aborts the entering overlay and ignores a later-resolving opponent', () => {
    vi.useFakeTimers();
    const fixture = setup({ team: [member(1)] });
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.beginRound1();
    fixture.componentInstance.cancelEnter();

    expect(inst.entering()).toBe(false);
    vi.advanceTimersByTime(850 * 3);
    expect(inst.phase()).toBe('preview'); // never entered, even though the countdown would have finished
    vi.useRealTimers();
  });

  it('confirmPick(): a real type advantage decides the round regardless of luck', () => {
    vi.useFakeTimers();
    const fixture = setup({
      team: [member(1, { types: ['fire'] })],
      detailsById: { 1: { weaknesses: [] } },
    });
    const inst = fixture.componentInstance as any;
    // Force a deterministic opponent with a real weakness to fire.
    inst.opponentTeam.set([{ pokemonId: 999, name: 'oppmon', spriteUrl: 's', types: ['grass'], power: 999999, weaknesses: ['fire'], resistances: [], bestMove: null }]);
    inst.usedOppIds.set(new Set());
    fixture.componentInstance.selectYourMon(1);

    fixture.componentInstance.confirmPick();
    expect(inst.phase()).toBe('suspense');
    expect(inst.isTransitioning()).toBe(true);

    vi.advanceTimersByTime(1100);

    expect(inst.phase()).toBe('revealed');
    expect(inst.roundHistory().length).toBe(1);
    expect(inst.roundHistory()[0].winner).toBe('you'); // real type advantage beats an oppMon with 1000x the power
    expect(inst.roundHistory()[0].reason).toBe('Type advantage');
    vi.useRealTimers();
  });

  it('confirmPick() is a no-op without a selected Pokémon', () => {
    const fixture = setup({ team: [member(1)] });
    fixture.componentInstance.confirmPick();
    expect((fixture.componentInstance as any).phase()).toBe('preview');
  });

  it('continueAfterReveal() advances to the next round when the match is not yet decided', () => {
    const fixture = setup({ team: [member(1), member(2), member(3)] });
    const inst = fixture.componentInstance as any;
    inst.settings.update((s: any) => ({ ...s, rounds: 3 }));
    inst.roundHistory.set([{ round: 1, yourMon: {}, oppMon: {}, winner: 'you', reason: 'Type advantage', explanation: '' }]);
    inst.phase.set('revealed');

    fixture.componentInstance.continueAfterReveal();

    expect(inst.phase()).toBe('picking');
    expect(recordMatch).not.toHaveBeenCalled();
  });

  it('continueAfterReveal() records the match exactly once and moves to matchOver once decided', () => {
    const fixture = setup({ team: [member(1)] });
    const inst = fixture.componentInstance as any;
    inst.settings.update((s: any) => ({ ...s, rounds: 1 }));
    inst.opponentName.set('Rival Ash');
    inst.roundHistory.set([{
      round: 1,
      yourMon: { pokemonId: 1, name: 'mon-1', types: ['fire'] },
      oppMon: { pokemonId: 2, name: 'mon-2', types: ['water'] },
      winner: 'you',
      reason: 'Type advantage',
      explanation: 'won',
    }]);
    inst.phase.set('revealed');

    fixture.componentInstance.continueAfterReveal();

    expect(inst.phase()).toBe('matchOver');
    expect(recordMatch).toHaveBeenCalledTimes(1);
    const payload = recordMatch.mock.calls[0][0];
    expect(payload.opponentName).toBe('Rival Ash');
    expect(payload.result).toBe('win');
    expect(payload.roundDetails.length).toBe(1);
    expect(payload.roundDetails[0].yourPokemonId).toBe(1);

    // Calling continueAfterReveal again (e.g. a stray double-invoke) must not double-record.
    fixture.componentInstance.continueAfterReveal();
    expect(recordMatch).toHaveBeenCalledTimes(1);
  });

  it('battleAgain() resets round state back to a fresh preview, keeping the chosen settings', () => {
    const fixture = setup({ team: [member(1)] });
    const inst = fixture.componentInstance as any;
    inst.settings.update((s: any) => ({ ...s, difficulty: 'hard' }));
    inst.phase.set('matchOver');
    inst.roundHistory.set([{ round: 1, yourMon: {}, oppMon: {}, winner: 'you', reason: 'Type advantage', explanation: '' }]);
    inst.usedYourIds.set(new Set([1]));

    fixture.componentInstance.battleAgain();

    expect(inst.phase()).toBe('preview');
    expect(inst.roundHistory()).toEqual([]);
    expect(inst.usedYourIds().size).toBe(0);
    expect(inst.settings().difficulty).toBe('hard'); // settings preserved, not reset
  });

  it('ngOnDestroy() clears any in-flight timers without throwing', () => {
    vi.useFakeTimers();
    const fixture = setup({ team: [member(1)] });
    fixture.componentInstance.beginRound1();

    expect(() => fixture.destroy()).not.toThrow();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    vi.useRealTimers();
  });
});
