import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TeamService } from '../../core/team';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';

const MIN_TEAM_SIZE = 1;
const POWER_ADVANTAGE_THRESHOLD = 15;
const RIVAL_NAMES = ['Rival Ash', 'Rival Skye', 'Rival Jun', 'Rival Nova', 'Rival Rook'];

// A Pokémon as it participates in a battle — power is the real PokeAPI
// base_experience field (same "PWR" used everywhere else in this app),
// weaknesses/resistances are the real type-matchup data GET /api/pokemon/:id
// already computes, and bestMove is the highest-power real move from that
// same response — nothing here is invented.
interface BattleMon {
  pokemonId: number;
  name: string;
  spriteUrl: string | null;
  types: string[];
  power: number;
  weaknesses: string[];
  resistances: string[];
  bestMove: string | null;
}

type Phase = 'preview' | 'picking' | 'suspense' | 'revealed' | 'matchOver';
type Winner = 'you' | 'opp';
type Reason = 'Type advantage' | 'Power advantage' | 'Coin flip';

interface RoundRecord {
  round: number;
  yourMon: BattleMon;
  oppMon: BattleMon;
  winner: Winner;
  reason: Reason;
}

// Real Battle Simulation: your actual Dream Team vs. a randomly-generated
// opponent team of the same size, drawn from real PokeAPI data (not a fixed
// roster). Per CLAUDE.md's own scope note this is intentionally simplified —
// no turns/moves/HP/accuracy — round winners come from real type
// weaknesses/resistances first, then real Power (base_experience), and only
// fall back to an explicit, labeled coin flip when neither signal decides it.
// Nothing is persisted — Battle is ephemeral/client-side, matching the "no
// full battle engine" scope decision; refreshing starts a fresh match.
@Component({
  selector: 'app-battle',
  imports: [RouterLink, LoadingScreen],
  templateUrl: './battle.html',
  styleUrl: './battle.css',
})
export class Battle {
  private readonly teamService = inject(TeamService);
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);

  protected readonly isLoading = signal(true);
  protected readonly hasError = signal(false);

  protected readonly yourTeam = signal<BattleMon[]>([]);
  protected readonly opponentTeam = signal<BattleMon[]>([]);
  protected readonly opponentName = signal('');

  protected readonly phase = signal<Phase>('preview');
  protected readonly usedYourIds = signal<Set<number>>(new Set());
  protected readonly usedOppIds = signal<Set<number>>(new Set());
  protected readonly selectedYourId = signal<number | null>(null);
  protected readonly hoveredYourId = signal<number | null>(null);
  protected readonly roundHistory = signal<RoundRecord[]>([]);
  protected readonly isTransitioning = signal(false);

  private pendingRound: RoundRecord | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly hasTeam = computed(() => this.yourTeam().length > 0);
  protected readonly totalRounds = computed(() => this.yourTeam().length);
  protected readonly currentRound = computed(() => this.roundHistory().length + 1);
  protected readonly yourWins = computed(() => this.roundHistory().filter((r) => r.winner === 'you').length);
  protected readonly oppWins = computed(() => this.roundHistory().filter((r) => r.winner === 'opp').length);
  protected readonly youLeading = computed(() => this.yourWins() > this.oppWins());
  protected readonly oppLeading = computed(() => this.oppWins() > this.yourWins());
  protected readonly showScoreBar = computed(() => {
    const p = this.phase();
    return p === 'picking' || p === 'suspense' || p === 'revealed';
  });

  protected readonly matchResult = computed<'win' | 'loss' | 'draw'>(() => {
    if (this.yourWins() > this.oppWins()) return 'win';
    if (this.oppWins() > this.yourWins()) return 'loss';
    return 'draw';
  });

  // One pip per round slot — 'win'/'loss'/'pending' — precomputed here so the
  // template doesn't need to fabricate a padding array itself.
  protected readonly yourRoundPips = computed(() =>
    Array.from({ length: this.totalRounds() }, (_, i) => {
      const round = this.roundHistory()[i];
      return round ? (round.winner === 'you' ? 'win' : 'loss') : 'pending';
    }),
  );
  protected readonly oppRoundPips = computed(() =>
    Array.from({ length: this.totalRounds() }, (_, i) => {
      const round = this.roundHistory()[i];
      return round ? (round.winner === 'opp' ? 'win' : 'loss') : 'pending';
    }),
  );

  protected readonly selectedYourMon = computed(() =>
    this.yourTeam().find((m) => m.pokemonId === this.selectedYourId()) ?? null,
  );

  protected readonly activeMon = computed(() => {
    const activeId = this.hoveredYourId() ?? this.selectedYourId();
    return this.yourTeam().find((m) => m.pokemonId === activeId) ?? null;
  });

  protected readonly pickableTeam = computed(() =>
    this.yourTeam().map((m) => ({ ...m, isUsed: this.usedYourIds().has(m.pokemonId) })),
  );

  protected readonly noSelection = computed(() => this.selectedYourId() == null);

  constructor() {
    this.loadBattle();
  }

  private loadBattle(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.teamService.getTeamStrict().subscribe({
      next: (team) => {
        if (team.length === 0) {
          this.yourTeam.set([]);
          this.isLoading.set(false);
          return;
        }
        forkJoin(team.map((m) => this.pokemonService.getById(m.pokemonId))).subscribe((details) => {
          const enriched = team.map((m, i) =>
            this.toBattleMon(m.pokemonId, m.pokemonName, m.spriteUrl, m.types, m.baseExperience, details[i]),
          );
          this.yourTeam.set(enriched);
          this.generateOpponent(enriched.length);
        });
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  private generateOpponent(count: number): void {
    this.pokemonService.search({ sort: 'id', page: 1 }).subscribe((firstPage) => {
      const pageSize = firstPage.pageSize || 20;
      const totalPages = Math.max(1, Math.ceil(firstPage.total / pageSize));
      const randomPage = 1 + Math.floor(Math.random() * totalPages);

      const useResults = (results: typeof firstPage.results) => {
        const pool = this.shuffle(results).slice(0, count);
        if (pool.length < count) {
          // PokeAPI/search is unreachable (search() swallows errors into an
          // empty result) — a broken/short opponent roster would make the
          // preview look silently wrong rather than failing loudly.
          this.hasError.set(true);
          this.isLoading.set(false);
          return;
        }
        forkJoin(pool.map((p) => this.pokemonService.getById(p.id))).subscribe((details) => {
          const oppTeam = pool.map((p, i) =>
            this.toBattleMon(p.id, p.name, p.spriteUrl, p.types, p.baseExperience, details[i]),
          );
          this.opponentTeam.set(oppTeam);
          this.opponentName.set(RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)]);
          this.isLoading.set(false);
        });
      };

      if (randomPage === 1) {
        useResults(firstPage.results);
        return;
      }
      this.pokemonService.search({ sort: 'id', page: randomPage }).subscribe((page) => {
        // A partial last page could have fewer results than we need — page 1
        // is always a full page for any real Pokédex size, so fall back to it.
        useResults(page.results.length >= count ? page.results : firstPage.results);
      });
    });
  }

  private toBattleMon(
    pokemonId: number,
    name: string,
    spriteUrl: string | null,
    types: string[],
    power: number,
    detail: PokemonDetail | null,
  ): BattleMon {
    return {
      pokemonId,
      name,
      spriteUrl,
      types,
      power,
      weaknesses: detail?.weaknesses ?? [],
      resistances: detail?.resistances ?? [],
      bestMove: detail?.topMoves?.[0]?.name ?? null,
    };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Type advantage first (real weaknesses/resistances from PokeAPI's damage
  // relations), then real Power (base_experience) if the gap is meaningful,
  // and only an explicit, UI-labeled coin flip when neither signal decides —
  // this is never hidden as if it were "real" battle logic.
  private resolveRound(yourMon: BattleMon, oppMon: BattleMon): { winner: Winner; reason: Reason } {
    const yourAdvantage = oppMon.weaknesses.some((w) => yourMon.types.includes(w));
    const oppAdvantage = yourMon.weaknesses.some((w) => oppMon.types.includes(w));
    if (yourAdvantage && !oppAdvantage) return { winner: 'you', reason: 'Type advantage' };
    if (oppAdvantage && !yourAdvantage) return { winner: 'opp', reason: 'Type advantage' };

    const diff = yourMon.power - oppMon.power;
    if (Math.abs(diff) >= POWER_ADVANTAGE_THRESHOLD) {
      return { winner: diff > 0 ? 'you' : 'opp', reason: 'Power advantage' };
    }
    return { winner: Math.random() < 0.5 ? 'you' : 'opp', reason: 'Coin flip' };
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  retry(): void {
    this.loadBattle();
  }

  selectYourMon(pokemonId: number): void {
    if (this.usedYourIds().has(pokemonId)) return;
    this.selectedYourId.set(pokemonId);
  }

  hoverYourMon(pokemonId: number): void {
    this.hoveredYourId.set(pokemonId);
  }

  unhoverYourMon(): void {
    this.hoveredYourId.set(null);
  }

  beginRound1(): void {
    this.phase.set('picking');
  }

  // Guarded by isTransitioning so a rapid double-click can't queue two
  // rounds at once.
  confirmPick(): void {
    if (this.isTransitioning()) return;
    const yourMon = this.selectedYourMon();
    if (!yourMon) return;

    const available = this.opponentTeam().filter((m) => !this.usedOppIds().has(m.pokemonId));
    const oppMon = available[Math.floor(Math.random() * available.length)];
    if (!oppMon) return;

    const { winner, reason } = this.resolveRound(yourMon, oppMon);

    this.isTransitioning.set(true);
    this.usedYourIds.update((s) => new Set(s).add(yourMon.pokemonId));
    this.usedOppIds.update((s) => new Set(s).add(oppMon.pokemonId));
    this.selectedYourId.set(null);
    this.hoveredYourId.set(null);
    this.pendingRound = { round: this.currentRound(), yourMon, oppMon, winner, reason };
    this.phase.set('suspense');

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const round = this.pendingRound;
      if (round) this.roundHistory.update((h) => [...h, round]);
      this.phase.set('revealed');
      this.isTransitioning.set(false);
    }, 1100);
  }

  continueAfterReveal(): void {
    if (this.isTransitioning()) return;
    this.phase.set(this.roundHistory().length >= this.totalRounds() ? 'matchOver' : 'picking');
  }

  battleAgain(): void {
    if (this.timer) clearTimeout(this.timer);
    this.phase.set('preview');
    this.usedYourIds.set(new Set());
    this.usedOppIds.set(new Set());
    this.selectedYourId.set(null);
    this.hoveredYourId.set(null);
    this.roundHistory.set([]);
    this.pendingRound = null;
    this.isTransitioning.set(false);
    this.isLoading.set(true);
    this.generateOpponent(this.yourTeam().length);
  }
}
