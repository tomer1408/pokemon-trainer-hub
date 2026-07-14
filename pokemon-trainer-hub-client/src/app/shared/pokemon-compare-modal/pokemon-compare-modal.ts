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
// fetch-by-id, no candidate list to pick from. The comparison itself stays
// independent of the team-focused compare/swap flows elsewhere in the app
// (Manage My Team's "⇄ Compare", the overflow swap modal, etc.) — but each
// side still needs a way to act on what the comparison shows, so Add to
// Team/Favorites live here too, delegating to the host's existing
// add/remove/swap-trigger logic (same as PokemonDetailModal's pattern).
@Component({
  selector: 'app-pokemon-compare-modal',
  templateUrl: './pokemon-compare-modal.html',
  styleUrl: './pokemon-compare-modal.css',
})
export class PokemonCompareModal {
  @Input({ required: true }) pokemonA!: PokemonSummary;
  @Input({ required: true }) pokemonB!: PokemonSummary;
  @Input() isFavoriteA = false;
  @Input() isFavoriteB = false;
  @Input() isOnTeamA = false;
  @Input() isOnTeamB = false;
  // Whether the team is currently full (5/5) — when true and a side isn't
  // already on the team, its action button reads "Compare" and routes into
  // the host's existing forced-swap flow instead of a plain add, same as
  // every other Add to Team button in the app.
  @Input() teamFull = false;
  @Input() isLight = false;
  @Input() isPikachu = false;

  @Output() closed = new EventEmitter<void>();
  @Output() toggleFavoriteA = new EventEmitter<void>();
  @Output() toggleFavoriteB = new EventEmitter<void>();
  // Host decides what "action" means (add / remove / open swap flow) based
  // on isOnTeamA/B + teamFull, exactly like Explorer's own grid card button —
  // this just reports which side was clicked.
  @Output() addToTeamA = new EventEmitter<void>();
  @Output() addToTeamB = new EventEmitter<void>();

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

  // Same label logic as Explorer's own grid card button, applied per side.
  actionLabel(isOnTeam: boolean): string {
    if (isOnTeam) return 'Remove';
    if (this.teamFull) return 'Compare';
    return 'Add to Team';
  }

  onCancel(): void {
    this.closed.emit();
  }
}
