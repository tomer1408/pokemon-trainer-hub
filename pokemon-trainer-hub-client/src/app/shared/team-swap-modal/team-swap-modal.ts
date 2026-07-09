import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { TeamService, DreamTeamMember } from '../../core/team';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';

interface StatRow {
  label: string;
  candidateValue: number;
  selectedValue: number;
  candidateWins: boolean;
  selectedWins: boolean;
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SPA',
  'special-defense': 'SPD',
  speed: 'SPE',
};

// Opened when the team is already full (5/5) and the user tries to add a 6th.
// Owns the swap mutation itself (unlike the Detail Modal's toggle buttons,
// this logic exists nowhere else on the host page) — emits `swapped` on
// success so the host can refresh its own team signal.
@Component({
  selector: 'app-team-swap-modal',
  templateUrl: './team-swap-modal.html',
  styleUrl: './team-swap-modal.css',
})
export class TeamSwapModal implements OnChanges {
  @Input({ required: true }) candidateId!: number;
  @Input({ required: true }) team: DreamTeamMember[] = [];
  @Input() isLight = false;

  @Output() closed = new EventEmitter<void>();
  @Output() swapped = new EventEmitter<void>();

  private readonly pokemonService = inject(PokemonService);
  private readonly teamService = inject(TeamService);

  protected readonly candidate = signal<PokemonDetail | null>(null);
  protected readonly selectedPokemonId = signal<number | null>(null);
  protected readonly isSwapping = signal(false);
  protected readonly swapError = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['candidateId']) {
      this.candidate.set(null);
      this.selectedPokemonId.set(null);
      this.swapError.set(null);
      this.pokemonService.getById(this.candidateId).subscribe((p) => this.candidate.set(p));
    }
  }

  protected readonly suggestedMember = computed<DreamTeamMember | null>(() => {
    if (this.team.length === 0) return null;
    return this.team.reduce((weakest, m) => (m.baseExperience < weakest.baseExperience ? m : weakest));
  });

  protected readonly selectedMember = computed<DreamTeamMember | null>(
    () => this.team.find((m) => m.pokemonId === this.selectedPokemonId()) ?? null,
  );

  protected readonly hasSelection = computed(() => this.selectedMember() !== null);

  protected readonly statRows = computed<StatRow[]>(() => {
    const c = this.candidate();
    const s = this.selectedMember();
    if (!c || !s) return [];
    return c.stats.map((cStat) => {
      const sValue = s.stats.find((x) => x.name === cStat.name)?.value ?? 0;
      return {
        label: STAT_LABELS[cStat.name] ?? cStat.name.toUpperCase(),
        candidateValue: cStat.value,
        selectedValue: sValue,
        candidateWins: cStat.value > sValue,
        selectedWins: sValue > cStat.value,
      };
    });
  });

  protected readonly powerDiff = computed(() => {
    const c = this.candidate();
    const s = this.selectedMember();
    return c && s ? c.baseExperience - s.baseExperience : 0;
  });

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  statFillPct(value: number): number {
    return Math.min(100, (value / 150) * 100);
  }

  selectMember(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
    this.swapError.set(null);
  }

  useSuggestion(): void {
    const weakest = this.suggestedMember();
    if (weakest) this.selectMember(weakest.pokemonId);
  }

  onCancel(): void {
    this.closed.emit();
  }

  onSwap(): void {
    const c = this.candidate();
    const s = this.selectedMember();
    if (!c || !s || this.isSwapping()) return;

    this.isSwapping.set(true);
    this.teamService.swapTeamMember(s.pokemonId, c.id).subscribe((result) => {
      this.isSwapping.set(false);
      if (result.ok) {
        this.swapped.emit();
      } else {
        this.swapError.set(result.message);
      }
    });
  }
}
