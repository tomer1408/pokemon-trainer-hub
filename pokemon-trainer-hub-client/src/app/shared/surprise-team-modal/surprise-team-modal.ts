import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PokemonSummary, TypeChart } from '../../core/pokemon';
import { TeamService } from '../../core/team';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';
import { LoadingScreen } from '../loading-screen/loading-screen';
import { getTeamPower, getTypeSegments, TypeSegment } from '../team-power';
import { getTeamMatchup, TeamMatchup } from '../team-matchup';
import { ComparablePokemon, TeamSwapModal } from '../team-swap-modal/team-swap-modal';

// A curated grid of up to 5 real, distinct Pokémon (never anything already
// on the Dream Team or in Favorites) — Explorer's "Surprise My Team" entry
// point. Deliberately NOT a bulk 5-way compare/add UI: clicking a card just
// reports the pick, and the host (Explorer) opens it in the existing
// PokemonDetailModal exactly like a normal grid click, so adding/comparing/
// favoriting one pick at a time reuses that existing flow. The one real bulk
// action this DOES own is "Replace My Team" — same atomic saveTeam() Manage
// My Team's Save Changes already uses (diffs current vs. target team and
// applies every add/remove server-side in one transaction), called directly
// from here (same pattern as TeamSwapModal calling swapTeamMember() itself)
// rather than routed back through the host.
@Component({
  selector: 'app-surprise-team-modal',
  imports: [LoadingScreen, TeamSwapModal, RouterLink],
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
  // True only on a genuine request failure — distinguishes that from a
  // legitimately exhausted pool (both leave picks empty) so the empty
  // state shows the right copy instead of "you've caught them all".
  @Input() loadError = false;
  @Input() isLight = false;
  @Input() isPikachu = false;
  // Real PokeAPI type-effectiveness chart — same one My Team's Battle
  // Readiness/Matchup Analysis cards use — needed to compute the strength/
  // weakness analysis and comparison below without inventing a new table.
  @Input() typeChart: TypeChart = {};
  // The trainer's real, current Dream Team — used both for the "Compare
  // with My Team" analysis toggle and as the anchor list for the
  // per-teammate head-to-head below.
  @Input() myTeam: ComparablePokemon[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() shuffle = new EventEmitter<void>();
  @Output() pickSelected = new EventEmitter<PokemonSummary>();
  // Emitted after a real, successful team change (bulk replace OR a single
  // head-to-head swap) — the new roster is already saved server-side, so the
  // host just needs to refresh its own team signal (sidebar/Team Power).
  @Output() teamChanged = new EventEmitter<void>();

  private readonly teamService = inject(TeamService);

  protected readonly confirmingReplace = signal(false);
  protected readonly isReplacing = signal(false);
  protected readonly replaceError = signal<string | null>(null);
  protected readonly showComparison = signal(false);
  // Which of the trainer's CURRENT teammates is being compared head-to-head
  // against these picks — same UI as Manage My Team's own "⇄ Compare"
  // (TeamSwapModal, 'team-vs-favorites' mode), just with this roll's 5
  // picks standing in for Favorites as the candidate pool.
  protected readonly compareAnchorId = signal<number | null>(null);

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  // Same pure, real-data-only calculations used elsewhere (Home/My Team's
  // Team Power, My Team's Battle Readiness/Matchup Analysis) — just applied
  // to this rolled set of picks instead of the trainer's saved team.
  protected pickedPower(): number {
    return getTeamPower(this.picks);
  }

  protected pickedTypeSegments(): TypeSegment[] {
    return getTypeSegments(this.picks);
  }

  protected pickedMatchup(): TeamMatchup {
    return getTeamMatchup(this.picks, this.typeChart);
  }

  protected myTeamPower(): number {
    return getTeamPower(this.myTeam);
  }

  protected myTeamMatchup(): TeamMatchup {
    return getTeamMatchup(this.myTeam, this.typeChart);
  }

  toggleComparison(): void {
    this.showComparison.update((v) => !v);
  }

  // This roll's picks, reshaped into the same ComparablePokemon shape
  // Manage My Team already passes as `comparisonCandidates` — the exact
  // fields overlap (id/name/spriteUrl/types/baseExperience/stats), just
  // under Dream Team Member's field names instead of PokemonSummary's.
  protected pickCandidates(): ComparablePokemon[] {
    return this.picks.map((p) => ({
      pokemonId: p.id,
      pokemonName: p.name,
      spriteUrl: p.spriteUrl,
      types: p.types,
      baseExperience: p.baseExperience,
      stats: p.stats,
    }));
  }

  // Feeds Manage My Team's own ?surprise= query param (see manage-team.ts's
  // surpriseMode) — opens that exact page, with this roll's picks standing
  // in for the trainer's real Favorites pool instead of a new page.
  protected surpriseQueryParams(): { surprise: string } {
    return { surprise: this.picks.map((p) => p.id).join(',') };
  }

  openTeammateCompare(pokemonId: number): void {
    this.compareAnchorId.set(pokemonId);
  }

  closeTeammateCompare(): void {
    this.compareAnchorId.set(null);
  }

  onTeammateSwapped(): void {
    this.compareAnchorId.set(null);
    this.teamChanged.emit();
  }

  onCancel(): void {
    this.closed.emit();
  }

  requestReplaceTeam(): void {
    if (this.picks.length === 0 || this.isReplacing()) return;
    this.replaceError.set(null);
    this.confirmingReplace.set(true);
  }

  cancelReplaceTeam(): void {
    this.confirmingReplace.set(false);
  }

  confirmReplaceTeam(): void {
    if (this.isReplacing()) return;
    this.isReplacing.set(true);
    this.replaceError.set(null);

    this.teamService.saveTeam(this.picks.map((p) => p.id)).subscribe((result) => {
      this.isReplacing.set(false);
      if (result.ok) {
        this.confirmingReplace.set(false);
        this.teamChanged.emit();
        this.closed.emit();
      } else {
        this.replaceError.set(result.message);
      }
    });
  }
}
