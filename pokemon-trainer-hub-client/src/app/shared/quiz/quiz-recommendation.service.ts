import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, shareReplay, tap } from 'rxjs';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { QuizPreferenceProfile, normalizeProfile } from './quiz-preferences';

// The compact shape the scoring engine actually needs — prepared once per
// Pokémon when the Gen 1 pool loads (see prepareScoringPokemon), instead of
// every scoring call re-searching PokemonSummary.stats (an array) by name.
export interface ScoringPokemon {
  id: number;
  name: string;
  spriteUrl: string | null;
  types: string[];
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  specialAttack: number;
  baseExperience: number;
}

export interface ScoredPokemon {
  // Intentionally ScoringPokemon, not the fuller PokemonSummary: the results
  // template only ever reads id/name/spriteUrl/types off this field, and
  // ScoringPokemon already carries all four — see starter-quiz.html.
  pokemon: ScoringPokemon;
  score: number;
  matchPercent: number;
  reasons: string[];
}

interface ScoredCandidate {
  pokemon: ScoringPokemon;
  score: number;
  typeScore: number;
  reasons: string[];
}

const GEN1_MAX_ID = 151;
const PAGE_SIZE = 20;
const TOP_RECOMMENDATIONS_COUNT = 3;

// Below this many successfully-loaded candidates, a partial PokeAPI outage
// is treated as a hard failure instead of silently scoring/recommending
// against a tiny, skewed slice of Gen 1.
export const MIN_VALID_CANDIDATES = 40;

// Once every preference category is normalized to sum to 1 (see
// quiz-preferences.ts), each category's own maximum possible contribution is
// exactly one of these scale constants — that's what makes calculateMatchScore
// able to compare a Pokémon's raw score against a real, meaningful ceiling
// instead of just "whoever scored highest in this run" (see Part B).
const TYPE_MATCH_SCALE = 100;
const STAT_MATCH_SCALE = 100;
const BALANCED_MATCH_SCALE = 100;

// A Pokémon's best matching type counts in full; a second matching type
// still helps (a genuine advantage for dual-types) but only at half
// strength, so two so-so type matches can never outscore one strong one.
const PRIMARY_TYPE_CONTRIBUTION = 1;
const SECONDARY_TYPE_CONTRIBUTION = 0.5;

// Preference-profile stat keys that map 1:1 onto ScoringPokemon's own field
// names (baseExperience is handled separately below — it lives in the same
// "stats" preference category but isn't a PokeAPI "stat").
const STAT_PREF_KEYS = ['hp', 'attack', 'defense', 'speed', 'specialAttack'] as const;

const STAT_LABEL: Record<string, string> = {
  hp: 'sturdy HP',
  attack: 'powerful Attack',
  defense: 'strong Defense',
  speed: 'blazing Speed',
  specialAttack: 'sharp Special Attack',
  baseExperience: 'strong overall power',
};

// Converts one PokeAPI-shaped PokemonSummary into the compact shape the
// scoring engine reads — done once per Pokémon when the pool loads (see
// QuizRecommendationService.loadGen1Pool), not once per scoring call.
export function prepareScoringPokemon(p: PokemonSummary): ScoringPokemon {
  const statValue = (name: string) => p.stats.find((s) => s.name === name)?.value ?? 0;
  return {
    id: p.id,
    name: p.name,
    spriteUrl: p.spriteUrl,
    types: p.types,
    hp: statValue('hp'),
    attack: statValue('attack'),
    defense: statValue('defense'),
    speed: statValue('speed'),
    specialAttack: statValue('special-attack'),
    baseExperience: p.baseExperience,
  };
}

interface StatRange {
  min: number;
  max: number;
}

// Real min/max per scored stat across the whole Gen 1 pool, computed once
// when the pool loads and reused for every scoring call — this is what lets
// calculateStatScore normalize a stat against Gen 1's actual real spread
// instead of an arbitrary fixed ceiling like `/150`.
export interface NormalizationMetadata {
  hp: StatRange;
  attack: StatRange;
  defense: StatRange;
  speed: StatRange;
  specialAttack: StatRange;
  baseExperience: StatRange;
}

function statRange(values: number[]): StatRange {
  return { min: Math.min(...values), max: Math.max(...values) };
}

// Computed once per loaded Gen 1 pool (see QuizRecommendationService), not
// once per scoring call — a cheap single pass over the already-compact pool.
export function buildNormalizationMetadata(pool: ScoringPokemon[]): NormalizationMetadata {
  return {
    hp: statRange(pool.map((p) => p.hp)),
    attack: statRange(pool.map((p) => p.attack)),
    defense: statRange(pool.map((p) => p.defense)),
    speed: statRange(pool.map((p) => p.speed)),
    specialAttack: statRange(pool.map((p) => p.specialAttack)),
    baseExperience: statRange(pool.map((p) => p.baseExperience)),
  };
}

// Real min-max normalization against the actual Gen 1 dataset instead of an
// arbitrary fixed ceiling. Falls back to a neutral 0.5 when every Pokémon in
// the pool shares the same value for this stat (min === max) — a degenerate
// case that shouldn't occur with real Gen 1 data, but is handled safely
// rather than dividing by zero.
function normalizeStatValue(value: number, range: StatRange): number {
  if (range.max === range.min) return 0.5;
  return Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));
}

// Removes any Pokémon already on the given team from the candidate pool —
// the quiz should never recommend something the trainer already has.
// Favorites are deliberately not filtered here; that's a separate concern
// not asked for by current product behavior.
export function filterExistingTeamMembers<T extends { id: number }>(pool: T[], teamPokemonIds: number[]): T[] {
  if (teamPokemonIds.length === 0) return pool;
  const excluded = new Set(teamPokemonIds);
  return pool.filter((p) => !excluded.has(p.id));
}

// Best matching type contributes in full, a second matching type at half
// strength (see PRIMARY_/SECONDARY_TYPE_CONTRIBUTION) — a controlled
// dual-type advantage instead of adding full credit for both types.
export function calculateTypeScore(
  types: string[],
  normalizedTypeWeights: Record<string, number>,
): { contribution: number; bestType: string | null } {
  const matched = types
    .map((type) => ({ type, weight: normalizedTypeWeights[type] ?? 0 }))
    .filter((m) => m.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  if (matched.length === 0) return { contribution: 0, bestType: null };

  const [best, second] = matched;
  const rawContribution =
    best.weight * PRIMARY_TYPE_CONTRIBUTION + (second ? second.weight * SECONDARY_TYPE_CONTRIBUTION : 0);

  return { contribution: rawContribution * TYPE_MATCH_SCALE, bestType: best.type };
}

// Normalizes each preferred stat's real value against the actual Gen 1
// pool's min/max (see buildNormalizationMetadata) and weights it by the
// user's normalized stat preference. baseExperience is scored the same way
// but isn't a PokeAPI "stat", so it's handled as its own branch.
export function calculateStatScore(
  pokemon: ScoringPokemon,
  normalizedStatWeights: Record<string, number>,
  metadata: NormalizationMetadata,
): { contribution: number; bestStatKey: string | null } {
  let contribution = 0;
  let bestStatKey: string | null = null;
  let bestStatContribution = 0;

  for (const prefKey of STAT_PREF_KEYS) {
    const weight = normalizedStatWeights[prefKey] ?? 0;
    if (weight <= 0) continue;
    const normalized = normalizeStatValue(pokemon[prefKey], metadata[prefKey]);
    const c = normalized * weight * STAT_MATCH_SCALE;
    contribution += c;
    if (c > bestStatContribution) {
      bestStatContribution = c;
      bestStatKey = prefKey;
    }
  }

  const bxWeight = normalizedStatWeights['baseExperience'] ?? 0;
  if (bxWeight > 0) {
    const normalized = normalizeStatValue(pokemon.baseExperience, metadata.baseExperience);
    const c = normalized * bxWeight * STAT_MATCH_SCALE;
    contribution += c;
    if (c > bestStatContribution) {
      bestStatContribution = c;
      bestStatKey = 'baseExperience';
    }
  }

  return { contribution, bestStatKey };
}

// Smaller spread between a Pokémon's highest and lowest real stat means more
// "balanced" — scaled by the user's normalized "balanced" style preference.
export function calculateBalancedBonus(pokemon: ScoringPokemon, normalizedBalancedWeight: number): number {
  if (normalizedBalancedWeight <= 0) return 0;
  const values = [pokemon.hp, pokemon.attack, pokemon.defense, pokemon.speed, pokemon.specialAttack];
  const spread = Math.max(...values) - Math.min(...values);
  const evenness = Math.max(0, 100 - spread) / 100;
  return evenness * normalizedBalancedWeight * BALANCED_MATCH_SCALE;
}

function buildReasons(
  bestType: string | null,
  bestStatKey: string | null,
  balancedBonus: number,
): string[] {
  const statPhrase = bestStatKey ? STAT_LABEL[bestStatKey] : null;
  const typePhrase = bestType ? `${bestType}-type` : null;

  if (statPhrase && typePhrase) {
    return [`Recommended because you value ${statPhrase} and ${typePhrase} Pokémon.`];
  }
  if (typePhrase) {
    return [`Recommended because you prefer ${typePhrase} Pokémon.`];
  }
  if (statPhrase) {
    return [`Recommended because your answers match its ${statPhrase}.`];
  }
  if (balancedBonus > 20) {
    return ['Recommended because you prefer well-rounded, balanced Pokémon.'];
  }
  return ['A solid all-around pick based on your answers.'];
}

// A Pokémon's raw score is the sum of at most three independent 0-100
// contributions (type/stat/balanced), so the *theoretical* maximum for this
// specific user's profile is just the sum of whichever categories their
// answers actually engaged — never a fixed constant that would understate
// (if the user never triggered "style") or overstate (if compared only
// against the current best candidate) what 100% should mean.
export function calculateMaxPossibleScore(normalizedProfile: QuizPreferenceProfile): number {
  const hasSignal = (weights: Record<string, number>) => Object.values(weights).some((w) => w > 0);
  const max =
    (hasSignal(normalizedProfile.types) ? TYPE_MATCH_SCALE : 0) +
    (hasSignal(normalizedProfile.stats) ? STAT_MATCH_SCALE : 0) +
    (hasSignal(normalizedProfile.style) ? BALANCED_MATCH_SCALE : 0);
  // A real 6-question quiz always engages at least one category, but this
  // stays defensive against a pathological all-empty profile so callers
  // never divide by zero.
  return Math.max(max, 1);
}

// Honest "Match Score": the candidate's raw score as a fraction of the real
// ceiling this profile could ever reach — not a probability, and not merely
// "highest of whoever happened to be in this pool" (see the old
// 60 + ratio*39 formula this replaces). Deterministic and clamped to 0-100.
export function calculateMatchScore(score: number, maxPossibleScore: number): number {
  const safeMax = maxPossibleScore > 0 ? maxPossibleScore : 1;
  const pct = Math.round((score / safeMax) * 100);
  return Math.min(100, Math.max(0, pct));
}

export function scoreOne(
  pokemon: ScoringPokemon,
  normalizedProfile: QuizPreferenceProfile,
  metadata: NormalizationMetadata,
): ScoredCandidate {
  const { contribution: typeScore, bestType } = calculateTypeScore(pokemon.types, normalizedProfile.types);
  const { contribution: statScore, bestStatKey } = calculateStatScore(pokemon, normalizedProfile.stats, metadata);
  const balancedBonus = calculateBalancedBonus(pokemon, normalizedProfile.style['balanced'] ?? 0);

  return {
    pokemon,
    score: typeScore + statScore + balancedBonus,
    typeScore,
    reasons: buildReasons(bestType, bestStatKey, balancedBonus),
  };
}

interface Gen1Dataset {
  pool: ScoringPokemon[];
  metadata: NormalizationMetadata;
}

// Rule-based Starter Quiz scoring — no AI/LLM involved. Scores every Gen 1
// Pokémon (minus the trainer's current team) against the user's normalized
// QuizPreferenceProfile using real PokeAPI data already served by the
// existing GET /api/pokemon endpoint, and returns the top 3.
@Injectable({ providedIn: 'root' })
export class QuizRecommendationService {
  private readonly pokemonService = inject(PokemonService);

  // Cached, shared Observable for the whole Gen 1 dataset (+ its
  // normalization metadata) — populated once per app session (this service
  // is providedIn: 'root', so one instance is shared everywhere).
  // shareReplay(1) makes every caller (prefetch, a quiz finish, a retake)
  // reuse the same in-flight request instead of firing a fresh set of 8 HTTP
  // calls each time; a successful load is replayed to every future
  // subscriber for the lifetime of the app. See loadGen1Dataset() for how a
  // failed load is deliberately NOT cached forever.
  private gen1Dataset$: Observable<Gen1Dataset> | null = null;

  // Kicks off (or reuses) the Gen 1 dataset load without waiting on it —
  // called from StarterQuiz.startQuiz() so the ~8-page fetch overlaps with
  // the time the user spends answering the 6 questions instead of starting
  // only after the last one. A prefetch failure is swallowed here on
  // purpose: finishQuiz() re-subscribes to the same cached Observable and
  // surfaces the real error state itself, so the user never sees a
  // duplicate/silent error from the prefetch alone.
  prefetchGen1Pool(): void {
    this.loadGen1Dataset().subscribe({ error: () => {} });
  }

  getRecommendations(
    profile: QuizPreferenceProfile,
    excludePokemonIds: number[] = [],
  ): Observable<ScoredPokemon[]> {
    return this.loadGen1Dataset().pipe(map((dataset) => this.rank(dataset, profile, excludePokemonIds)));
  }

  // Reuses the cached dataset if one is already loading or already loaded;
  // otherwise starts (and caches) a fresh load. On failure, the cached
  // reference is cleared *before* the error reaches shareReplay's internal
  // subject — shareReplay still correctly replays that single failure to
  // whichever callers were already waiting on it, but the NEXT call to
  // loadGen1Dataset() sees gen1Dataset$ is null and starts a brand-new
  // request instead of replaying the same stale error forever.
  private loadGen1Dataset(): Observable<Gen1Dataset> {
    if (!this.gen1Dataset$) {
      this.gen1Dataset$ = this.fetchGen1Dataset().pipe(
        tap({ error: () => (this.gen1Dataset$ = null) }),
        shareReplay(1),
      );
    }
    return this.gen1Dataset$;
  }

  // GET /api/pokemon already returns each entry with real stats — 8 pages of
  // 20 covers all of Gen 1 (ids 1-151) in 8 requests total, instead of 151
  // individual getById() calls. Each Pokémon is converted to its compact
  // ScoringPokemon shape exactly once here, and the pool's min-max
  // normalization metadata is computed once alongside it, so retakes/repeated
  // scoring never re-walk PokemonSummary.stats or recompute dataset-wide
  // min/max.
  //
  // Note on partial failures: PokemonService.search() already degrades any
  // single page's HTTP error into a safe `{ results: [] }` (see
  // core/pokemon.ts) rather than an Observable error, so forkJoin here
  // doesn't actually fail outright just because one page failed — the real
  // risk is silently ending up with a much smaller pool than intended. The
  // MIN_VALID_CANDIDATES check below is what turns "too small to trust" into
  // an explicit failure instead of quietly recommending from a skewed slice.
  private fetchGen1Dataset(): Observable<Gen1Dataset> {
    const pageCount = Math.ceil(GEN1_MAX_ID / PAGE_SIZE);
    const requests = Array.from({ length: pageCount }, (_, i) =>
      this.pokemonService.search({ sort: 'id', page: i + 1 }),
    );
    return forkJoin(requests).pipe(
      map((pages) => {
        const merged = pages
          .flatMap((p) => p.results)
          .filter((p) => p.id <= GEN1_MAX_ID);
        // De-duped defensively by id — pages are disjoint by construction,
        // but this guards against any future page-boundary change quietly
        // producing an overlap (and so a duplicate card in the results).
        const unique = [...new Map(merged.map((p) => [p.id, p])).values()].sort((a, b) => a.id - b.id);

        if (unique.length < MIN_VALID_CANDIDATES) {
          throw new Error(
            `Only ${unique.length} of ${GEN1_MAX_ID} Gen 1 Pokémon loaded (minimum ${MIN_VALID_CANDIDATES}) — treating as a failed load.`,
          );
        }
        if (unique.length < GEN1_MAX_ID) {
          // Still enough to recommend from, but worth a visible signal that
          // PokeAPI degraded rather than failing silently.
          console.warn(`Starter Quiz: only ${unique.length}/${GEN1_MAX_ID} Gen 1 Pokémon loaded.`);
        }

        const pool = unique.map(prepareScoringPokemon);
        return { pool, metadata: buildNormalizationMetadata(pool) };
      }),
    );
  }

  private rank(
    { pool, metadata }: Gen1Dataset,
    profile: QuizPreferenceProfile,
    excludePokemonIds: number[],
  ): ScoredPokemon[] {
    const normalizedProfile = normalizeProfile(profile);
    const maxPossibleScore = calculateMaxPossibleScore(normalizedProfile);
    const candidates = filterExistingTeamMembers(pool, excludePokemonIds);

    const scored = candidates.map((pokemon) => scoreOne(pokemon, normalizedProfile, metadata));

    scored.sort(
      (a, b) =>
        b.score - a.score || b.typeScore - a.typeScore || b.pokemon.baseExperience - a.pokemon.baseExperience || a.pokemon.id - b.pokemon.id,
    );

    return scored.slice(0, TOP_RECOMMENDATIONS_COUNT).map((s) => ({
      pokemon: s.pokemon,
      score: s.score,
      matchPercent: calculateMatchScore(s.score, maxPossibleScore),
      reasons: s.reasons,
    }));
  }
}
