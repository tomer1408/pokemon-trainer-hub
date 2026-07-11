import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { TeamService, PokemonStat } from '../../core/team';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';
import { LoadingScreen } from '../loading-screen/loading-screen';

interface StatRow {
  label: string;
  candidateValue: number;
  selectedValue: number;
  selectedUnavailable: boolean;
  candidateWins: boolean;
  selectedWins: boolean;
}

// Anything that can appear in the "pick one of these" list — Dream Team
// members and Favorites share this exact shape, so either can be passed as
// `comparisonCandidates` without conversion.
export interface ComparablePokemon {
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string | null;
  types: string[];
  baseExperience: number;
  stats: PokemonStat[];
}

// - 'overflow': team is already full (5/5) and the user tried to add a 6th —
//   `selectedPokemonId` is that 6th Pokémon, `comparisonCandidates` is the
//   team; picking a candidate removes IT and adds the 6th.
// - 'favorite-vs-team': user opened a Favorite and wants to compare/swap it
//   into the team — `selectedPokemonId` is the favorite (not on the team),
//   `comparisonCandidates` is the team; picking a candidate removes IT and
//   adds the favorite. Structurally identical to 'overflow', just a
//   different entry point/copy.
// - 'team-vs-favorites': user opened a current team member and wants to see
//   it against their Favorites — `selectedPokemonId` IS on the team,
//   `comparisonCandidates` is the favorites pool; picking a candidate adds
//   IT and removes the anchor team member.
// 'compare': the team has room — show the same head-to-head comparison UI,
// but the only action is a plain, non-destructive Add to Team (no removal
// picked/forced), unlike the other three modes which always trade one
// member for another.
export type SwapMode = 'overflow' | 'favorite-vs-team' | 'team-vs-favorites' | 'compare';

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SPA',
  'special-defense': 'SPD',
  speed: 'SPE',
};

// Generalized Head-to-Head / swap modal. One card is always "the anchor" —
// a single fixed Pokémon, always fetched fresh via PokemonService for
// reliable stats — compared against a list of candidates the user picks one
// from. Which side ends up added to / removed from the team depends on
// `mode`: in 'team-vs-favorites' the anchor is already on the team (so the
// anchor is what leaves); in the other two modes the anchor is what joins.
@Component({
  selector: 'app-team-swap-modal',
  imports: [LoadingScreen],
  templateUrl: './team-swap-modal.html',
  styleUrl: './team-swap-modal.css',
})
export class TeamSwapModal implements OnChanges {
  @Input({ required: true }) selectedPokemonId!: number;
  @Input({ required: true }) comparisonCandidates: ComparablePokemon[] = [];
  @Input() mode: SwapMode = 'overflow';
  @Input() isLight = false;
  // When false, confirming does NOT call the backend — it just reports which
  // pair was picked and lets the host apply it locally instead. Used by
  // Manage My Team when the anchor is a team member that's only sitting in
  // the local drag draft (not yet saved), so there's nothing real to remove
  // server-side yet.
  @Input() persistImmediately = true;

  @Output() closed = new EventEmitter<void>();
  @Output() swapped = new EventEmitter<{ removedPokemonId: number; addedPokemonId: number }>();
  // Only emitted by 'compare' mode's confirmAdd() — distinct from `swapped`
  // since nothing was removed.
  @Output() added = new EventEmitter<{ addedPokemonId: number }>();

  private readonly pokemonService = inject(PokemonService);
  private readonly teamService = inject(TeamService);

  protected readonly anchor = signal<PokemonDetail | null>(null);
  protected readonly anchorLoadFailed = signal(false);
  protected readonly pickedId = signal<number | null>(null);
  protected readonly isSwapping = signal(false);
  protected readonly isAdding = signal(false);
  protected readonly swapError = signal<string | null>(null);
  protected readonly confirmingSwap = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedPokemonId']) {
      this.anchor.set(null);
      this.anchorLoadFailed.set(false);
      this.pickedId.set(null);
      this.swapError.set(null);
      this.loadAnchor();
    }
  }

  retryLoadAnchor(): void {
    this.anchorLoadFailed.set(false);
    this.loadAnchor();
  }

  private loadAnchor(): void {
    this.pokemonService.getById(this.selectedPokemonId).subscribe((p) => {
      this.anchor.set(p);
      if (!p) this.anchorLoadFailed.set(true);
    });
  }

  // In 'team-vs-favorites' the picker list is favorites — the useful
  // suggestion is "best pickup" (highest power). In the other modes the
  // list is team members and the removal candidate — "who's weakest".
  protected readonly suggestedMember = computed<ComparablePokemon | null>(() => {
    const list = this.comparisonCandidates;
    if (list.length === 0) return null;
    return this.mode === 'team-vs-favorites'
      ? list.reduce((best, m) => (m.baseExperience > best.baseExperience ? m : best))
      : list.reduce((weakest, m) => (m.baseExperience < weakest.baseExperience ? m : weakest));
  });

  protected readonly pickedMember = computed<ComparablePokemon | null>(
    () => this.comparisonCandidates.find((m) => m.pokemonId === this.pickedId()) ?? null,
  );

  protected readonly hasSelection = computed(() => this.pickedMember() !== null);

  // If the picked candidate's stats failed to load earlier (e.g. a transient
  // PokeAPI hiccup when its list was fetched), stats is [] — showing "0" for
  // every stat would make the anchor falsely "win" every row. Show "N/A" and
  // skip the win/lose marks for that candidate instead.
  protected readonly pickedStatsUnavailable = computed(() => {
    const s = this.pickedMember();
    return !!s && s.stats.length === 0;
  });

  protected readonly statRows = computed<StatRow[]>(() => {
    const c = this.anchor();
    const s = this.pickedMember();
    if (!c || !s) return [];
    const unavailable = this.pickedStatsUnavailable();
    return c.stats.map((cStat) => {
      const sValue = s.stats.find((x) => x.name === cStat.name)?.value ?? 0;
      return {
        label: STAT_LABELS[cStat.name] ?? cStat.name.toUpperCase(),
        candidateValue: cStat.value,
        selectedValue: sValue,
        selectedUnavailable: unavailable,
        candidateWins: !unavailable && cStat.value > sValue,
        selectedWins: !unavailable && sValue > cStat.value,
      };
    });
  });

  protected readonly powerDiff = computed(() => {
    const c = this.anchor();
    const s = this.pickedMember();
    return c && s ? c.baseExperience - s.baseExperience : 0;
  });

  // ---- mode-aware copy ----
  protected readonly headerKicker = computed(() => {
    if (this.mode === 'compare') return 'Compare & decide';
    if (this.mode === 'overflow') return "Team's full — 5/5";
    return 'Compare & swap';
  });

  protected readonly headerTitle = computed(() => {
    switch (this.mode) {
      case 'compare':
        return 'See how this Pokémon compares to your team';
      case 'team-vs-favorites':
        return 'Compare this team member with your favorites';
      case 'favorite-vs-team':
        return 'Compare this favorite with your team';
      default:
        return 'Which Pokémon should make the cut?';
    }
  });

  protected readonly anchorKicker = computed(() => {
    switch (this.mode) {
      case 'team-vs-favorites':
        return 'Your Pokémon';
      case 'favorite-vs-team':
        return 'Your Favorite';
      default:
        return 'Candidate';
    }
  });

  protected readonly pickedKicker = computed(() =>
    this.mode === 'team-vs-favorites' ? 'Favorite' : 'Your Teammate',
  );

  protected readonly pickNoun = computed(() => (this.mode === 'team-vs-favorites' ? 'favorite' : 'teammate'));

  // Whichever side ends up ON the team after a confirmed swap.
  protected readonly addName = computed(() =>
    this.mode === 'team-vs-favorites' ? this.pickedMember()?.pokemonName : this.anchor()?.name,
  );
  // Whichever side leaves the team.
  protected readonly removeName = computed(() =>
    this.mode === 'team-vs-favorites' ? this.anchor()?.name : this.pickedMember()?.pokemonName,
  );

  protected readonly suggestionTitle = computed(() => {
    const sm = this.suggestedMember();
    if (!sm) return '';
    return this.mode === 'team-vs-favorites' ? `Suggested pickup: ${sm.pokemonName}` : `Suggested swap: ${sm.pokemonName}`;
  });

  protected readonly suggestionReason = computed(() => {
    const sm = this.suggestedMember();
    if (!sm) return '';
    return this.mode === 'team-vs-favorites'
      ? `Highest Power among your favorites (${sm.baseExperience}) — adding ${sm.pokemonName} could strengthen your roster.`
      : `Lowest Team Power (${sm.baseExperience}) — swapping ${sm.pokemonName} keeps your roster hitting the hardest.`;
  });

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  statFillPct(value: number): number {
    return Math.min(100, (value / 150) * 100);
  }

  pickCandidate(pokemonId: number): void {
    this.pickedId.set(pokemonId);
    this.swapError.set(null);
  }

  useSuggestion(): void {
    const sm = this.suggestedMember();
    if (sm) this.pickCandidate(sm.pokemonId);
  }

  onCancel(): void {
    this.closed.emit();
  }

  requestSwap(): void {
    if (!this.hasSelection() || this.isSwapping()) return;
    this.confirmingSwap.set(true);
  }

  cancelSwapConfirm(): void {
    this.confirmingSwap.set(false);
  }

  confirmSwap(): void {
    const c = this.anchor();
    const s = this.pickedMember();
    this.confirmingSwap.set(false);
    if (!c || !s || this.isSwapping()) return;

    const [removedPokemonId, addedPokemonId] =
      this.mode === 'team-vs-favorites' ? [c.id, s.pokemonId] : [s.pokemonId, c.id];

    if (!this.persistImmediately) {
      this.swapped.emit({ removedPokemonId, addedPokemonId });
      return;
    }

    this.isSwapping.set(true);
    this.teamService.swapTeamMember(removedPokemonId, addedPokemonId).subscribe((result) => {
      this.isSwapping.set(false);
      if (result.ok) {
        this.swapped.emit({ removedPokemonId, addedPokemonId });
      } else {
        this.swapError.set(result.message);
      }
    });
  }

  // 'compare' mode only — never removes anyone, just grows the real team via
  // the exact same endpoint Explorer/Home/Starter Quiz already use for a
  // plain Add to Team. DUPLICATE/TEAM_FULL/other errors all surface through
  // the same swapError slot the swap flows already use for their own errors.
  confirmAdd(): void {
    const c = this.anchor();
    if (!c || this.isAdding()) return;

    this.isAdding.set(true);
    this.swapError.set(null);

    this.teamService.addToTeam(c.id).subscribe((result) => {
      this.isAdding.set(false);
      if (result.ok) {
        this.added.emit({ addedPokemonId: c.id });
      } else {
        this.swapError.set(result.message);
      }
    });
  }
}
