import { Component, input, output } from '@angular/core';
import { PokemonDetail } from '../../core/pokemon';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';

@Component({
  selector: 'app-potd-card',
  templateUrl: './potd-card.html',
  styleUrl: './potd-card.css',
})
export class PotdCard {
  readonly pokemon = input.required<PokemonDetail>();
  readonly isLight = input(false);
  // Narrow-container usage (e.g. Explorer's team sidebar) — fills the
  // available width instead of the fixed 340px used in wider row layouts.
  readonly compact = input(false);

  readonly opened = output<void>();

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }
}
