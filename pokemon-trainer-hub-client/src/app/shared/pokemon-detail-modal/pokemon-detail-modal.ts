import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';

type Tab = 'overview' | 'abilities' | 'moves';

// Shared, presentational: the host page owns favorite/team state and mutations
// (it already has that data reactively) — this component only displays a
// Pokémon's detail and emits the user's intent (toggleFavorite/addToTeam).
@Component({
  selector: 'app-pokemon-detail-modal',
  templateUrl: './pokemon-detail-modal.html',
  styleUrl: './pokemon-detail-modal.css',
})
export class PokemonDetailModal implements OnChanges {
  @Input({ required: true }) pokemonId!: number;
  @Input() isFavorite = false;
  @Input() isOnTeam = false;
  @Input() teamFull = false;
  @Input() isLight = false;

  @Output() closed = new EventEmitter<void>();
  @Output() toggleFavorite = new EventEmitter<void>();
  @Output() addToTeam = new EventEmitter<void>();

  private readonly pokemonService = inject(PokemonService);

  protected readonly pokemon = signal<PokemonDetail | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly tab = signal<Tab>('overview');
  protected readonly expandedAbilities = signal<Set<number>>(new Set());

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pokemonId']) {
      this.tab.set('overview');
      this.expandedAbilities.set(new Set());
      this.isLoading.set(true);
      this.pokemon.set(null);
      this.pokemonService.getById(this.pokemonId).subscribe((p) => {
        this.pokemon.set(p);
        this.isLoading.set(false);
      });
    }
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  toggleAbility(index: number): void {
    const next = new Set(this.expandedAbilities());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.expandedAbilities.set(next);
  }

  isAbilityExpanded(index: number): boolean {
    return this.expandedAbilities().has(index);
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  statFillPct(value: number): number {
    return Math.min(100, (value / 150) * 100);
  }

  playCry(): void {
    const cry = this.pokemon()?.cry;
    if (cry) new Audio(cry).play();
  }

  onClose(): void {
    this.closed.emit();
  }
}
