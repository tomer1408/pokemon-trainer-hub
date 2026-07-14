import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BattleHistoryService, BattleMatchRecord, BattleRoundDetail } from '../../core/battle-history';
import { ThemeService } from '../../shared/theme';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';

const BATTLE_HISTORY_LOADING_TIPS = [
  'Tallying your wins…',
  'Digging through match history…',
  'Counting knockouts…',
  'Reviewing your best rounds…',
];

type ResultFilter = 'all' | 'win' | 'loss';

interface ChampionRow {
  name: string;
  spriteUrl: string | null;
  count: number;
  wins: number;
  pct: number;
}

interface TypeEdgeRow {
  type: string;
  count: number;
  wins: number;
  pct: number;
}

interface MatchLogRow {
  id: number;
  win: boolean;
  opponentName: string;
  score: string;
  difficulty: string;
  decidedBy: string;
  date: string;
  team: { pokemonId: number; pokemonName: string; spriteUrl: string | null }[];
}

// Real Battle History, adapted from a mockup that assumed concepts our
// simplified Battle engine doesn't have (per-fight "turns", "HP left %") —
// those are dropped rather than faked. Everything shown here is computed
// from BattleMatchRecord[] (GET /api/battle-history), the same real data
// battle.ts already produces during a match and now actually saves.
@Component({
  selector: 'app-battle-history',
  imports: [RouterLink, LoadingScreen, PokemonDetailModal],
  templateUrl: './battle-history.html',
  styleUrl: './battle-history.css',
})
export class BattleHistory {
  private readonly battleHistoryService = inject(BattleHistoryService);
  protected readonly theme = inject(ThemeService);

  protected readonly isLoading = signal(true);
  protected readonly loadingTips = BATTLE_HISTORY_LOADING_TIPS;
  protected readonly history = signal<BattleMatchRecord[]>([]);
  protected readonly filter = signal<ResultFilter>('all');

  protected readonly tabs: { value: ResultFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'win', label: 'Wins' },
    { value: 'loss', label: 'Losses' },
  ];

  constructor() {
    this.battleHistoryService.getHistory().subscribe((history) => {
      this.history.set(history);
      this.isLoading.set(false);
    });
  }

  protected readonly hasData = computed(() => this.history().length > 0);

  protected readonly total = computed(() => this.history().length);
  protected readonly wins = computed(() => this.history().filter((m) => m.result === 'win').length);
  protected readonly losses = computed(() => this.total() - this.wins());
  protected readonly winRate = computed(() => (this.total() === 0 ? 0 : Math.round((this.wins() / this.total()) * 100)));

  // history() is newest-first (server orders by createdAt desc) — a
  // streak is just how many matches in a row, starting from the most
  // recent, share the same result.
  protected readonly currentStreak = computed(() => {
    const h = this.history();
    if (h.length === 0) return { length: 0, isWin: true };
    const isWin = h[0].result === 'win';
    let len = 0;
    for (const m of h) {
      if ((m.result === 'win') !== isWin) break;
      len++;
    }
    return { length: len, isWin };
  });

  protected readonly bestWinStreak = computed(() => {
    const chrono = [...this.history()].reverse();
    let best = 0;
    let run = 0;
    for (const m of chrono) {
      if (m.result === 'win') {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    return best;
  });

  protected readonly avgRoundsPerBattle = computed(() => {
    const h = this.history();
    if (h.length === 0) return '0.0';
    return (h.reduce((sum, m) => sum + m.roundsPlayed, 0) / h.length).toFixed(1);
  });

  private readonly allRounds = computed(() => this.history().flatMap((m) => m.roundDetails));

  protected readonly goToPokemon = computed(() => {
    const rounds = this.allRounds();
    if (rounds.length === 0) return null;
    const counts = new Map<string, number>();
    rounds.forEach((r) => counts.set(r.yourPokemonName, (counts.get(r.yourPokemonName) ?? 0) + 1));
    let best = rounds[0].yourPokemonName;
    let bestCount = 0;
    counts.forEach((count, name) => {
      if (count > bestCount) {
        bestCount = count;
        best = name;
      }
    });
    return { name: best, count: bestCount };
  });

  // Oldest -> latest, matching the mockup's "Recent form" strip direction.
  protected readonly recentForm = computed(() =>
    this.history()
      .slice(0, 12)
      .reverse()
      .map((m) => ({ win: m.result === 'win', title: `${m.opponentName} — ${m.result === 'win' ? 'Win' : 'Loss'}` })),
  );

  protected readonly champions = computed<ChampionRow[]>(() => {
    const rounds = this.allRounds();
    const bySprite = new Map<string, string | null>();
    const byName = new Map<string, { count: number; wins: number }>();
    this.history().forEach((m) =>
      m.teamSnapshot.forEach((t) => {
        if (!bySprite.has(t.pokemonName)) bySprite.set(t.pokemonName, t.spriteUrl);
      }),
    );
    rounds.forEach((r) => {
      const entry = byName.get(r.yourPokemonName) ?? { count: 0, wins: 0 };
      entry.count++;
      if (r.winner === 'you') entry.wins++;
      byName.set(r.yourPokemonName, entry);
    });
    return Array.from(byName.entries())
      .map(([name, s]) => ({
        name,
        spriteUrl: bySprite.get(name) ?? null,
        count: s.count,
        wins: s.wins,
        pct: Math.round((s.wins / s.count) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  });

  protected readonly typeEdges = computed<{ best: TypeEdgeRow | null; worst: TypeEdgeRow | null }>(() => {
    const rounds = this.allRounds();
    const byType = new Map<string, { count: number; wins: number }>();
    rounds.forEach((r) => {
      const entry = byType.get(r.oppType) ?? { count: 0, wins: 0 };
      entry.count++;
      if (r.winner === 'you') entry.wins++;
      byType.set(r.oppType, entry);
    });
    const rows = Array.from(byType.entries())
      .map(([type, s]) => ({ type, count: s.count, wins: s.wins, pct: Math.round((s.wins / s.count) * 100) }))
      .filter((s) => s.count >= 2);
    if (rows.length === 0) return { best: null, worst: null };
    const sorted = [...rows].sort((a, b) => b.pct - a.pct);
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  });

  protected readonly matchLog = computed<MatchLogRow[]>(() => {
    const f = this.filter();
    return this.history()
      .filter((m) => f === 'all' || m.result === f)
      .map((m) => {
        const reasons = Array.from(new Set(m.roundDetails.map((r) => r.reason)));
        return {
          id: m.id,
          win: m.result === 'win',
          opponentName: m.opponentName,
          score: `${m.yourWins}-${m.oppWins}`,
          difficulty: m.difficulty,
          decidedBy: reasons.join(', '),
          date: this.formatDate(m.createdAt),
          team: m.teamSnapshot.map((t) => ({ pokemonId: t.pokemonId, pokemonName: t.pokemonName, spriteUrl: t.spriteUrl })),
        };
      });
  });

  protected readonly noMatches = computed(() => this.matchLog().length === 0);

  protected readonly selectedMatchId = signal<number | null>(null);

  protected readonly selectedMatch = computed(
    () => this.history().find((m) => m.id === this.selectedMatchId()) ?? null,
  );

  // A single derived headline for the opened match: who carried it (most
  // round wins), and what usually decided their wins — computed straight
  // from that match's own real roundDetails, not a canned template.
  protected readonly selectedMatchInsight = computed(() => {
    const m = this.selectedMatch();
    if (!m || m.roundDetails.length === 0) return '';

    const winsByMon = new Map<string, number>();
    const reasonCounts = new Map<string, number>();
    for (const r of m.roundDetails) {
      if (r.winner !== 'you') continue;
      winsByMon.set(r.yourPokemonName, (winsByMon.get(r.yourPokemonName) ?? 0) + 1);
      reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
    }

    if (winsByMon.size === 0) {
      return `${m.opponentName}'s team won every round — no MVP to highlight from this one.`;
    }

    let mvpName = '';
    let mvpWins = 0;
    winsByMon.forEach((count, name) => {
      if (count > mvpWins) {
        mvpWins = count;
        mvpName = name;
      }
    });

    let topReason = '';
    let topReasonCount = 0;
    reasonCounts.forEach((count, reason) => {
      if (count > topReasonCount) {
        topReasonCount = count;
        topReason = reason;
      }
    });

    const reasonPart = topReason ? `, most often on ${topReason.toLowerCase()}` : '';
    return `${this.capitalize(mvpName)} was your MVP with ${mvpWins} round win${mvpWins === 1 ? '' : 's'}${reasonPart}.`;
  });

  openMatch(id: number): void {
    this.selectedMatchId.set(id);
  }

  closeMatch(): void {
    this.selectedMatchId.set(null);
  }

  // View-only lookup from the match's teamSnapshot — that Pokémon may not
  // even be on the trainer's live team anymore, so this never wires up
  // team/favorite mutations (see PokemonDetailModal's readOnly input).
  protected readonly viewedPokemonId = signal<number | null>(null);

  viewPokemon(pokemonId: number): void {
    this.viewedPokemonId.set(pokemonId);
  }

  closePokemonView(): void {
    this.viewedPokemonId.set(null);
  }

  private formatDate(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return `${Math.round(days / 7)}w ago`;
  }

  setFilter(value: ResultFilter): void {
    this.filter.set(value);
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type.toLowerCase() as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  // The exact power numbers compared that round were never persisted (only
  // the category was) — this turns what IS actually stored (winner, reason,
  // names, types) into a real sentence instead of a bare "Power advantage"
  // label, without inventing figures we don't have.
  roundExplanation(r: BattleRoundDetail): string {
    const winnerName = this.capitalize(r.winner === 'you' ? r.yourPokemonName : r.oppPokemonName);
    const loserName = this.capitalize(r.winner === 'you' ? r.oppPokemonName : r.yourPokemonName);

    if (r.reason === 'Type advantage') {
      const winnerType = this.capitalize(r.winner === 'you' ? r.yourType : r.oppType);
      const loserType = this.capitalize(r.winner === 'you' ? r.oppType : r.yourType);
      return `${winnerName} beat ${loserName} with a type advantage (${winnerType} vs ${loserType}).`;
    }
    if (r.reason === 'Power advantage') {
      return `${winnerName} beat ${loserName} on raw power advantage.`;
    }
    return `${winnerName} narrowly edged out ${loserName} on a coin flip — it was close.`;
  }
}
