import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PokemonSummary } from '../../core/pokemon';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';
import { LoadingScreen } from '../loading-screen/loading-screen';

// A curated grid of up to 5 real, distinct Pokémon (never anything already
// on the Dream Team or in Favorites) — Explorer's "Surprise My Team" entry
// point. Deliberately NOT a bulk 5-way compare/add UI: clicking any card
// just reports the pick, and the host (Explorer) opens it in the existing
// PokemonDetailModal exactly like a normal grid click, so adding/comparing/
// favoriting each pick reuses that one-at-a-time flow instead of inventing
// new bulk-apply logic.
@Component({
  selector: 'app-surprise-team-modal',
  imports: [LoadingScreen],
  templateUrl: './surprise-team-modal.html',
  styleUrl: './surprise-team-modal.css',
})
export class SurpriseTeamModal {
  @Input({ required: true }) picks: PokemonSummary[] = [];
  @Input() isLoading = false;
  // True when the trainer's favoriteType pool ran out and the server had to
  // fall back to the full dex for this batch — mirrors the single Surprise
  // Me's usedFallback framing, just described for a set instead of one pick.
  @Input() usedFallback = false;
  @Input() isLight = false;
  @Input() isPikachu = false;

  @Output() closed = new EventEmitter<void>();
  @Output() shuffle = new EventEmitter<void>();
  @Output() pickSelected = new EventEmitter<PokemonSummary>();

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  onCancel(): void {
    this.closed.emit();
  }
}
