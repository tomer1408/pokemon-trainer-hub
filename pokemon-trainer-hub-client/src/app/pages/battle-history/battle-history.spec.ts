import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BattleHistoryService, BattleMatchRecord } from '../../core/battle-history';
import { BattleHistory } from './battle-history';

describe('BattleHistory', () => {
  function match(overrides: Partial<BattleMatchRecord> = {}): BattleMatchRecord {
    return {
      id: 1,
      opponentName: 'Team Rocket',
      difficulty: 'hard',
      rounds: 5,
      roundsPlayed: 3,
      opponentType: 'fire',
      luckFactor: 'balanced',
      result: 'win',
      yourWins: 2,
      oppWins: 1,
      roundDetails: [
        { round: 1, yourPokemonId: 25, yourPokemonName: 'pikachu', yourType: 'electric', oppPokemonId: 4, oppPokemonName: 'charmander', oppType: 'fire', winner: 'you', reason: 'Type advantage' },
        { round: 2, yourPokemonId: 25, yourPokemonName: 'pikachu', yourType: 'electric', oppPokemonId: 4, oppPokemonName: 'charmander', oppType: 'fire', winner: 'opp', reason: 'Power advantage' },
        { round: 3, yourPokemonId: 6, yourPokemonName: 'charizard', yourType: 'fire', oppPokemonId: 4, oppPokemonName: 'charmander', oppType: 'fire', winner: 'you', reason: 'Coin flip' },
      ],
      teamSnapshot: [
        { pokemonId: 25, pokemonName: 'pikachu', spriteUrl: 's25', types: ['electric'], power: 112 },
        { pokemonId: 6, pokemonName: 'charizard', spriteUrl: 's6', types: ['fire'], power: 240 },
      ],
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function setup(history: BattleMatchRecord[] = []) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: BattleHistoryService, useValue: { getHistory: () => of(history) } }],
    });
    const fixture = TestBed.createComponent(BattleHistory);
    fixture.detectChanges();
    return fixture;
  }

  it('loads real history and stops the loading state', () => {
    const fixture = setup([match()]);
    const inst = fixture.componentInstance as any;
    expect(inst.isLoading()).toBe(false);
    expect(inst.hasData()).toBe(true);
  });

  it('total/wins/losses/winRate are derived from the real results', () => {
    const fixture = setup([match({ id: 1, result: 'win' }), match({ id: 2, result: 'loss' }), match({ id: 3, result: 'win' })]);
    const inst = fixture.componentInstance as any;
    expect(inst.total()).toBe(3);
    expect(inst.wins()).toBe(2);
    expect(inst.losses()).toBe(1);
    expect(inst.winRate()).toBe(67);
  });

  it('winRate() is 0 (not NaN) for an empty history', () => {
    const fixture = setup([]);
    expect((fixture.componentInstance as any).winRate()).toBe(0);
  });

  it('currentStreak() counts consecutive same-result matches from the most recent', () => {
    // Server order is newest-first.
    const fixture = setup([match({ id: 3, result: 'win' }), match({ id: 2, result: 'win' }), match({ id: 1, result: 'loss' })]);
    expect((fixture.componentInstance as any).currentStreak()).toEqual({ length: 2, isWin: true });
  });

  it('bestWinStreak() finds the longest chronological run of wins', () => {
    // Newest-first: loss, win, win, win, loss -> chronological: loss,win,win,win,loss -> best run 3.
    const fixture = setup([
      match({ id: 5, result: 'loss' }),
      match({ id: 4, result: 'win' }),
      match({ id: 3, result: 'win' }),
      match({ id: 2, result: 'win' }),
      match({ id: 1, result: 'loss' }),
    ]);
    expect((fixture.componentInstance as any).bestWinStreak()).toBe(3);
  });

  it('avgRoundsPerBattle() averages roundsPlayed across all matches, formatted to 1 decimal', () => {
    const fixture = setup([match({ roundsPlayed: 3 }), match({ roundsPlayed: 4 })]);
    expect((fixture.componentInstance as any).avgRoundsPerBattle()).toBe('3.5');
  });

  it('avgRoundsPerBattle() is "0.0" for an empty history', () => {
    expect((setup([]).componentInstance as any).avgRoundsPerBattle()).toBe('0.0');
  });

  it('goToPokemon() finds the most-used Pokémon across all rounds', () => {
    const fixture = setup([match()]); // pikachu appears in 2 rounds, charizard in 1
    expect((fixture.componentInstance as any).goToPokemon()).toEqual({ name: 'pikachu', count: 2 });
  });

  it('goToPokemon() is null when there are no rounds at all', () => {
    expect((setup([]).componentInstance as any).goToPokemon()).toBeNull();
  });

  it('champions() ranks Pokémon by usage and computes each one\'s real win rate', () => {
    const fixture = setup([match()]);
    const champs = (fixture.componentInstance as any).champions();
    const pikachu = champs.find((c: any) => c.name === 'pikachu');
    expect(pikachu.count).toBe(2);
    expect(pikachu.wins).toBe(1);
    expect(pikachu.pct).toBe(50);
  });

  it('typeEdges() only considers opponent types faced at least twice, and picks best/worst by win pct', () => {
    const fixture = setup([match()]); // opponent type 'fire' faced 3 times (2 wins, 1 loss) -> only type with count>=2
    const edges = (fixture.componentInstance as any).typeEdges();
    expect(edges.best.type).toBe('fire');
    expect(edges.best.pct).toBe(67);
  });

  it('typeEdges() returns nulls when no opponent type was faced twice', () => {
    const fixture = setup([
      match({ id: 1, roundDetails: [{ round: 1, yourPokemonId: 25, yourPokemonName: 'pikachu', yourType: 'electric', oppPokemonId: 1, oppPokemonName: 'bulbasaur', oppType: 'grass', winner: 'you', reason: 'Type advantage' }] }),
    ]);
    expect((fixture.componentInstance as any).typeEdges()).toEqual({ best: null, worst: null });
  });

  it('matchLog() filters by result and joins distinct round reasons', () => {
    const fixture = setup([match({ id: 1, result: 'win' }), match({ id: 2, result: 'loss' })]);
    const inst = fixture.componentInstance as any;
    expect(inst.matchLog().length).toBe(2);

    inst.setFilter('win');
    expect(inst.matchLog().length).toBe(1);
    expect(inst.matchLog()[0].decidedBy).toBe('Type advantage, Power advantage, Coin flip');
  });

  it('noMatches() reflects the filtered match log, not the raw history', () => {
    const fixture = setup([match({ result: 'win' })]);
    const inst = fixture.componentInstance as any;
    expect(inst.noMatches()).toBe(false);
    inst.setFilter('loss');
    expect(inst.noMatches()).toBe(true);
  });

  it('openMatch()/closeMatch() control the selected match and its derived insight', () => {
    const fixture = setup([match()]);
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.openMatch(1);
    expect(inst.selectedMatch().id).toBe(1);
    expect(inst.selectedMatchInsight()).toContain('was your MVP');
    fixture.componentInstance.closeMatch();
    expect(inst.selectedMatch()).toBeNull();
  });

  it('selectedMatchInsight() calls out a total loss when the trainer never won a round', () => {
    const fixture = setup([
      match({
        roundDetails: [{ round: 1, yourPokemonId: 25, yourPokemonName: 'pikachu', yourType: 'electric', oppPokemonId: 4, oppPokemonName: 'charmander', oppType: 'fire', winner: 'opp', reason: 'Power advantage' }],
      }),
    ]);
    fixture.componentInstance.openMatch(1);
    expect((fixture.componentInstance as any).selectedMatchInsight()).toContain("won every round");
  });

  it('viewPokemon()/closePokemonView() control the read-only detail modal target', () => {
    const fixture = setup([match()]);
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.viewPokemon(25);
    expect(inst.viewedPokemonId()).toBe(25);
    fixture.componentInstance.closePokemonView();
    expect(inst.viewedPokemonId()).toBeNull();
  });

  it('roundExplanation() writes a real sentence per reason type', () => {
    const fixture = setup([]);
    const inst = fixture.componentInstance;
    const typeRound = match().roundDetails[0];
    expect(inst.roundExplanation(typeRound)).toBe('Pikachu beat Charmander with a type advantage (Electric vs Fire).');

    const powerRound = match().roundDetails[1];
    expect(inst.roundExplanation(powerRound)).toBe('Charmander beat Pikachu on raw power advantage.');

    const coinRound = match().roundDetails[2];
    expect(inst.roundExplanation(coinRound)).toContain('coin flip');
  });

  it('typeColor() falls back to normal for an unrecognized type', () => {
    const fixture = setup([]);
    expect(fixture.componentInstance.typeColor('made-up')).toBeTruthy();
  });
});
