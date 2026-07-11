import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PokemonSummary } from '../../core/pokemon';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';

interface StatRow {
  label: string;
  aValue: number;
  bValue: number;
  aWins: boolean;
  bWins: boolean;
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SPA',
  'special-defense': 'SPD',
  speed: 'SPE',
};

// A lightweight, standalone head-to-head comparison for Explorer's "Compare
// any two" tool. Unlike TeamSwapModal, both Pokémon are already fully known
// up front (Explorer's own grid results already carry real stats) — no
// fetch-by-id, no candidate list to pick from, and no team/swap action.
// Deliberately independent of the team-focused compare/swap flows elsewhere
// in the app (Manage My Team's "⇄ Compare", the overflow swap modal, etc.)
// — this one is just a read-only comparison, nothing more.
@Component({
  selector: 'app-pokemon-compare-modal',
  templateUrl: './pokemon-compare-modal.html',
  styleUrl: './pokemon-compare-modal.css',
})
export class PokemonCompareModal {
  @Input({ required: true }) pokemonA!: PokemonSummary;
  @Input({ required: true }) pokemonB!: PokemonSummary;
  @Input() isLight = false;

  @Output() closed = new EventEmitter<void>();

  protected statRows(): StatRow[] {
    return this.pokemonA.stats.map((aStat) => {
      const bValue = this.pokemonB.stats.find((x) => x.name === aStat.name)?.value ?? 0;
      return {
        label: STAT_LABELS[aStat.name] ?? aStat.name.toUpperCase(),
        aValue: aStat.value,
        bValue,
        aWins: aStat.value > bValue,
        bWins: bValue > aStat.value,
      };
    });
  }

  protected get powerDiff(): number {
    return this.pokemonA.baseExperience - this.pokemonB.baseExperience;
  }

  statFillPct(value: number): number {
    return Math.min(100, (value / 150) * 100);
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type.toLowerCase() as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  onCancel(): void {
    this.closed.emit();
  }
}
