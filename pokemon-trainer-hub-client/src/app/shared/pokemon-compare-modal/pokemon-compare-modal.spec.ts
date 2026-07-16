import { TestBed } from '@angular/core/testing';
import { PokemonSummary } from '../../core/pokemon';
import { TYPE_COLORS } from '../pokemon-types';
import { PokemonCompareModal } from './pokemon-compare-modal';

describe('PokemonCompareModal', () => {
  function mon(overrides: Partial<PokemonSummary> = {}): PokemonSummary {
    return {
      id: 25,
      name: 'pikachu',
      baseExperience: 112,
      types: ['electric'],
      spriteUrl: 's',
      stats: [{ name: 'hp', value: 35 }, { name: 'attack', value: 55 }],
      ...overrides,
    };
  }

  function setup(a: PokemonSummary = mon(), b: PokemonSummary = mon({ id: 6, name: 'charizard', baseExperience: 240, stats: [{ name: 'hp', value: 78 }, { name: 'attack', value: 84 }] })) {
    const fixture = TestBed.createComponent(PokemonCompareModal);
    fixture.componentInstance.pokemonA = a;
    fixture.componentInstance.pokemonB = b;
    fixture.detectChanges();
    return fixture;
  }

  it('statRows() flags the winning side per stat', () => {
    const fixture = setup();
    const rows = (fixture.componentInstance as any).statRows();
    const hp = rows.find((r: any) => r.label === 'HP');
    expect(hp.aWins).toBe(false);
    expect(hp.bWins).toBe(true);
  });

  it('statRows() flags neither side as winning on an exact tie', () => {
    const fixture = setup(mon({ stats: [{ name: 'hp', value: 50 }] }), mon({ stats: [{ name: 'hp', value: 50 }] }));
    const row = (fixture.componentInstance as any).statRows()[0];
    expect(row.aWins).toBe(false);
    expect(row.bWins).toBe(false);
  });

  it('powerDiff is pokemonA.baseExperience minus pokemonB.baseExperience', () => {
    const fixture = setup(mon({ baseExperience: 300 }), mon({ baseExperience: 100 }));
    expect((fixture.componentInstance as any).powerDiff).toBe(200);
  });

  it('statFillPct() caps at 100', () => {
    const fixture = setup();
    expect(fixture.componentInstance.statFillPct(999)).toBe(100);
    expect(fixture.componentInstance.statFillPct(75)).toBe(50);
  });

  it('typeColor() is case-insensitive and falls back to normal for an unknown type', () => {
    const fixture = setup();
    expect(fixture.componentInstance.typeColor('ELECTRIC')).toBe(TYPE_COLORS['electric']);
    expect(fixture.componentInstance.typeColor('made-up')).toBe(TYPE_COLORS['normal']);
  });

  it('actionLabel() reads Remove/Compare/Add to Team based on team state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance;
    expect(inst.actionLabel(true)).toBe('Remove');

    inst.teamFull = true;
    expect(inst.actionLabel(false)).toBe('Compare');

    inst.teamFull = false;
    expect(inst.actionLabel(false)).toBe('Add to Team');
  });

  it('onCancel() emits closed', () => {
    const fixture = setup();
    let emitted = false;
    fixture.componentInstance.closed.subscribe(() => (emitted = true));
    fixture.componentInstance.onCancel();
    expect(emitted).toBe(true);
  });
});
