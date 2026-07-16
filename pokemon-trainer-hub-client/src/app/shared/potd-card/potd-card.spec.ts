import { TestBed } from '@angular/core/testing';
import { PokemonDetail } from '../../core/pokemon';
import { TYPE_COLORS } from '../pokemon-types';
import { PotdCard } from './potd-card';

describe('PotdCard', () => {
  function mockPokemon(): PokemonDetail {
    return {
      id: 25,
      name: 'pikachu',
      baseExperience: 112,
      types: ['electric'],
      spriteUrl: 's',
      stats: [],
      abilities: [],
      cry: null,
      height: 4,
      weight: 60,
      flavorText: null,
      weaknesses: [],
      resistances: [],
      topMoves: [],
    };
  }

  function setup() {
    const fixture = TestBed.createComponent(PotdCard);
    fixture.componentRef.setInput('pokemon', mockPokemon());
    fixture.detectChanges();
    return fixture;
  }

  it('resolves a known type to its real brand color', () => {
    const fixture = setup();
    expect(fixture.componentInstance.typeColor('electric')).toBe(TYPE_COLORS['electric']);
  });

  it('falls back to the normal type color for an unrecognized type', () => {
    const fixture = setup();
    expect(fixture.componentInstance.typeColor('made-up-type')).toBe(TYPE_COLORS['normal']);
  });

  it('emits opened when the real card button is clicked', () => {
    const fixture = setup();
    let emitted = false;
    fixture.componentInstance.opened.subscribe(() => (emitted = true));

    fixture.nativeElement.querySelector('button.potd-inner').click();

    expect(emitted).toBe(true);
  });
});
