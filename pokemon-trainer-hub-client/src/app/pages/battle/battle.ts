import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TeamService } from '../../core/team';
import { PokemonService, PokemonDetail, PokemonSummary } from '../../core/pokemon';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { AppSettingsService } from '../../shared/app-settings';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';

const MIN_TEAM_SIZE = 1;
const POWER_ADVANTAGE_THRESHOLD = 15;
const RIVAL_NAMES = ['Rival Ash', 'Rival Skye', 'Rival Jun', 'Rival Nova', 'Rival Rook'];

// ---- Battle Settings (Prepare for Battle screen) ----
export type BattleDifficulty = 'easy' | 'medium' | 'hard' | 'boss';
export type BattleLength = 1 | 3 | 5;
export type OpponentType = 'random' | 'fire' | 'water' | 'electric' | 'grass' | 'balanced';
export type LuckFactor = 'low' | 'medium' | 'high';

export interface BattleSettings {
  difficulty: BattleDifficulty;
  rounds: BattleLength;
  opponentType: OpponentType;
  luckFactor: LuckFactor;
  showExplanations: boolean;
}

// showExplanationsDefault seeds this from the Settings page's saved
// preference — Battle's own settings panel can still override it for just
// this session, same as every other field here.
function buildDefaultSettings(showExplanationsDefault: boolean): BattleSettings {
  return { difficulty: 'medium', rounds: 3, opponentType: 'random', luckFactor: 'medium', showExplanations: showExplanationsDefault };
}

// First side to win this many rounds takes the match — 1 Round needs just 1,
// Best of 3 needs 2, Best of 5 needs 3.
function calculateRequiredWins(rounds: BattleLength): number {
  return Math.ceil(rounds / 2);
}

// How far opponent power should sit from the user's team average for each
// difficulty — a multiplier, not a fabricated stat.
const DIFFICULTY_POWER_MULTIPLIER: Record<BattleDifficulty, number> = {
  easy: 0.75,
  medium: 1,
  hard: 1.35,
  boss: 1.8,
};

// Re-sorts real candidates by how close their real Power is to the
// difficulty-adjusted target — never filters down to fewer than the pool
// already has, so it always degrades gracefully instead of running short.
function applyDifficulty(pool: PokemonSummary[], difficulty: BattleDifficulty, avgPower: number): PokemonSummary[] {
  const target = avgPower * DIFFICULTY_POWER_MULTIPLIER[difficulty];
  return [...pool].sort((a, b) => Math.abs(a.baseExperience - target) - Math.abs(b.baseExperience - target));
}

// Greedily picks real Pokémon with distinct primary types (for "Balanced"),
// topping up with whatever's left (still difficulty-sorted) if the pool
// isn't varied enough to fill every slot with a unique type.
function pickTypeDiverse(sorted: PokemonSummary[], count: number): PokemonSummary[] {
  const picked: PokemonSummary[] = [];
  const usedTypes = new Set<string>();
  for (const p of sorted) {
    if (picked.length >= count) break;
    if (!usedTypes.has(p.types[0])) {
      picked.push(p);
      usedTypes.add(p.types[0]);
    }
  }
  for (const p of sorted) {
    if (picked.length >= count) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

// Combines Opponent Type + Difficulty into the final opponent roster, all
// drawn from the real candidate pool already fetched from PokeAPI — nothing
// here invents a Pokémon that wasn't actually in that pool.
function selectOpponents(
  pool: PokemonSummary[],
  count: number,
  avgPower: number,
  settings: BattleSettings,
): PokemonSummary[] {
  let candidates = pool;
  if (settings.opponentType !== 'random' && settings.opponentType !== 'balanced') {
    const preferred = pool.filter((p) => p.types.includes(settings.opponentType));
    // Fall back to the full pool if the type filter leaves too few real
    // candidates for the requested team size, rather than coming up short.
    candidates = preferred.length >= count ? preferred : pool;
  }

  const byDifficulty = applyDifficulty(candidates, settings.difficulty, avgPower);

  if (settings.opponentType === 'balanced') {
    return pickTypeDiverse(byDifficulty, count);
  }
  return byDifficulty.slice(0, count);
}

// Small random multiplier applied to Power before comparing rounds — never
// applied to the type-advantage check, so luck can't override a real type
// matchup, only nudge a close Power comparison.
const LUCK_RANGE: Record<LuckFactor, number> = { low: 0.05, medium: 0.12, high: 0.25 };
function applyLuckFactor(power: number, luck: LuckFactor): number {
  const range = LUCK_RANGE[luck];
  const multiplier = 1 + (Math.random() * 2 - 1) * range;
  return power * multiplier;
}

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
  explanation: string;
}

// A short, honest sentence about what actually decided the round — built
// from the real reason (type advantage / power / luck), never a stat this
// simplified engine doesn't actually track (e.g. Speed).
function generateExplanation(yourMon: BattleMon, oppMon: BattleMon, winner: Winner, reason: Reason): string {
  const winnerMon = winner === 'you' ? yourMon : oppMon;
  const loserMon = winner === 'you' ? oppMon : yourMon;
  if (reason === 'Type advantage') {
    return `${winnerMon.name} won because it had a type advantage over ${loserMon.name}.`;
  }
  if (reason === 'Power advantage') {
    return `${winnerMon.name} won with higher Power (${winnerMon.power} vs ${loserMon.power}).`;
  }
  return `${winnerMon.name} and ${loserMon.name} were evenly matched — this round came down to luck.`;
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
export class Battle implements OnDestroy {
  private readonly teamService = inject(TeamService);
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);
  private readonly appSettings = inject(AppSettingsService);

  protected readonly isLoading = signal(true);
  protected readonly hasError = signal(false);

  protected readonly yourTeam = signal<BattleMon[]>([]);
  protected readonly opponentTeam = signal<BattleMon[]>([]);
  protected readonly opponentName = signal('');

  // ---- Battle Settings (Prepare for Battle screen) ----
  protected readonly settings = signal<BattleSettings>(buildDefaultSettings(this.appSettings.battleExplanationsDefault()));

  protected readonly difficultyOptions: { value: BattleDifficulty; label: string; helper: string }[] = [
    { value: 'easy', label: 'Easy', helper: 'Weaker opponents' },
    { value: 'medium', label: 'Medium', helper: 'Balanced challenge' },
    { value: 'hard', label: 'Hard', helper: 'Stronger opponents' },
    { value: 'boss', label: 'Boss', helper: 'Powerful final challenge' },
  ];
  protected readonly lengthOptions: { value: BattleLength; label: string }[] = [
    { value: 1, label: '1 Round' },
    { value: 3, label: 'Best of 3' },
    { value: 5, label: 'Best of 5' },
  ];
  protected readonly opponentTypeOptions: { value: OpponentType; label: string; color: string | null }[] = [
    { value: 'random', label: 'Random', color: null },
    { value: 'fire', label: 'Fire', color: TYPE_COLORS['fire'] },
    { value: 'water', label: 'Water', color: TYPE_COLORS['water'] },
    { value: 'electric', label: 'Electric', color: TYPE_COLORS['electric'] },
    { value: 'grass', label: 'Grass', color: TYPE_COLORS['grass'] },
    { value: 'balanced', label: 'Balanced', color: null },
  ];
  protected readonly luckOptions: { value: LuckFactor; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];
  private static readonly LUCK_HELP: Record<LuckFactor, string> = {
    low: 'Low: stats matter most.',
    medium: 'Medium: balanced randomness.',
    high: 'High: surprises can happen.',
  };
  protected readonly luckHelperText = computed(() => Battle.LUCK_HELP[this.settings().luckFactor]);

  // Short, human-readable summary of the current settings — shown in the
  // "Ready to battle" bar and again inside the entering-arena overlay.
  protected readonly summaryChips = computed(() => {
    const s = this.settings();
    const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
    const lengthLabel = this.lengthOptions.find((o) => o.value === s.rounds)?.label ?? `${s.rounds} Round`;
    return [cap(s.difficulty), lengthLabel, `${cap(s.opponentType)} type`, `${cap(s.luckFactor)} luck`, `Explain ${s.showExplanations ? 'On' : 'Off'}`];
  });

  // ---- Entering-arena overlay (countdown shown while the opponent, which
  // depends on the chosen settings, is generated in the background) ----
  protected readonly entering = signal(false);
  protected readonly countValue = signal(3);
  protected readonly countPhase = signal<'count' | 'go'>('count');
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private opponentReady = false;
  private countdownDone = false;
  private enterCancelled = false;

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
  // Rounds picked in settings (1/3/5), capped by team size for the (rare)
  // case of a small team — never asks for more distinct Pokémon picks than
  // the team actually has.
  protected readonly totalRounds = computed(() => Math.min(this.settings().rounds, this.yourTeam().length));
  protected readonly requiredWins = computed(() => calculateRequiredWins(this.settings().rounds));
  protected readonly currentRound = computed(() => this.roundHistory().length + 1);
  protected readonly yourWins = computed(() => this.roundHistory().filter((r) => r.winner === 'you').length);
  protected readonly oppWins = computed(() => this.roundHistory().filter((r) => r.winner === 'opp').length);
  protected readonly youLeading = computed(() => this.yourWins() > this.oppWins());
  protected readonly oppLeading = computed(() => this.oppWins() > this.yourWins());
  // The match is over once either side has clinched the required win count —
  // not just when every possible round has been played. This is what makes
  // a sweep (e.g. 2-0 in Best of 3) end immediately instead of playing out a
  // meaningless extra round.
  protected readonly matchDecided = computed(
    () =>
      this.yourWins() >= this.requiredWins() ||
      this.oppWins() >= this.requiredWins() ||
      this.roundHistory().length >= this.totalRounds(),
  );
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
          this.isLoading.set(false);
          // Stop here, on the Prepare for Battle (settings) screen — the
          // opponent isn't generated until Start Battle, since Difficulty and
          // Opponent Type need to be known first.
        });
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  private generateOpponent(count: number): void {
    const team = this.yourTeam();
    const avgPower = team.length ? team.reduce((sum, m) => sum + m.power, 0) / team.length : 0;
    const settings = this.settings();

    this.pokemonService.search({ sort: 'id', page: 1 }).subscribe((firstPage) => {
      const pageSize = firstPage.pageSize || 20;
      const totalPages = Math.max(1, Math.ceil(firstPage.total / pageSize));
      const randomPage = 1 + Math.floor(Math.random() * totalPages);

      const useResults = (results: typeof firstPage.results) => {
        const selected = selectOpponents(this.shuffle(results), count, avgPower, settings);
        if (selected.length < count) {
          // PokeAPI/search is unreachable (search() swallows errors into an
          // empty result) — a broken/short opponent roster would make the
          // battle look silently wrong rather than failing loudly.
          this.hasError.set(true);
          this.isLoading.set(false);
          this.entering.set(false);
          return;
        }
        forkJoin(selected.map((p) => this.pokemonService.getById(p.id))).subscribe((details) => {
          const oppTeam = selected.map((p, i) =>
            this.toBattleMon(p.id, p.name, p.spriteUrl, p.types, p.baseExperience, details[i]),
          );
          this.opponentTeam.set(oppTeam);
          this.opponentName.set(RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)]);
          this.isLoading.set(false);
          this.opponentReady = true;
          this.maybeEnterArena();
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
  // relations) — luck never overrides this. Only once neither side has a
  // type edge does Power (with the settings' luck factor nudging it a
  // little) decide the round, falling back to an explicit, UI-labeled coin
  // flip when that's still too close to call.
  private resolveRound(yourMon: BattleMon, oppMon: BattleMon, settings: BattleSettings): { winner: Winner; reason: Reason } {
    const yourAdvantage = oppMon.weaknesses.some((w) => yourMon.types.includes(w));
    const oppAdvantage = yourMon.weaknesses.some((w) => oppMon.types.includes(w));
    if (yourAdvantage && !oppAdvantage) return { winner: 'you', reason: 'Type advantage' };
    if (oppAdvantage && !yourAdvantage) return { winner: 'opp', reason: 'Type advantage' };

    const yourRolled = applyLuckFactor(yourMon.power, settings.luckFactor);
    const oppRolled = applyLuckFactor(oppMon.power, settings.luckFactor);
    const diff = yourRolled - oppRolled;
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

  updateSetting<K extends keyof BattleSettings>(key: K, value: BattleSettings[K]): void {
    this.settings.update((s) => ({ ...s, [key]: value }));
  }

  toggleExplanations(): void {
    this.settings.update((s) => ({ ...s, showExplanations: !s.showExplanations }));
  }

  // Shows the entering-arena countdown while generating the opponent (using
  // the chosen settings) in the background — the two run in parallel, and
  // whichever finishes last is what actually moves to Round 1 (see
  // maybeEnterArena). isLoading is deliberately NOT used here — the overlay
  // itself is the loading state for this transition.
  beginRound1(): void {
    if (!this.hasTeam()) return;

    this.entering.set(true);
    this.countValue.set(3);
    this.countPhase.set('count');
    this.opponentReady = false;
    this.countdownDone = false;
    this.enterCancelled = false;

    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      const next = this.countValue() - 1;
      if (next > 0) {
        this.countValue.set(next);
        return;
      }
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      this.countPhase.set('go');
      this.countdownDone = true;
      this.maybeEnterArena();
    }, 850);

    this.generateOpponent(this.totalRounds());
  }

  // Only actually enters Round 1 once BOTH the countdown has finished AND
  // the real opponent data has arrived — whichever of the two takes longer
  // is what the user waits for, so this never shows Round 1 before the
  // opponent is genuinely ready.
  private maybeEnterArena(): void {
    if (this.enterCancelled) return;
    if (this.opponentReady && this.countdownDone) {
      this.entering.set(false);
      this.phase.set('picking');
    }
  }

  // Clicking anywhere on the overlay backs out to the settings screen — the
  // in-flight opponent request is simply ignored when it resolves (guarded
  // by enterCancelled in maybeEnterArena) rather than cancelled outright.
  cancelEnter(): void {
    this.enterCancelled = true;
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.entering.set(false);
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

    const { winner, reason } = this.resolveRound(yourMon, oppMon, this.settings());
    const explanation = generateExplanation(yourMon, oppMon, winner, reason);

    this.isTransitioning.set(true);
    this.usedYourIds.update((s) => new Set(s).add(yourMon.pokemonId));
    this.usedOppIds.update((s) => new Set(s).add(oppMon.pokemonId));
    this.selectedYourId.set(null);
    this.hoveredYourId.set(null);
    this.pendingRound = { round: this.currentRound(), yourMon, oppMon, winner, reason, explanation };
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
    this.phase.set(this.matchDecided() ? 'matchOver' : 'picking');
  }

  // Back to the Prepare for Battle screen — settings are kept as they were
  // (not reset to defaults), and a new opponent is only generated once the
  // user clicks Start Battle again via beginRound1().
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
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }
}
