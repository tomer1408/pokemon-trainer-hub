import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { QuizPreferenceProfile } from './quiz-preferences';

export interface ScoredPokemon {
  pokemon: PokemonSummary;
  score: number;
  matchPercent: number;
  reasons: string[];
}

const GEN1_MAX_ID = 151;
const PAGE_SIZE = 20;

// Realistic ceilings used only to normalize real stat values into a 0-1
// range before scoring — not invented stats, just a scale factor so a
// single high stat (e.g. Speed 130) can't swamp the type-match score.
// 150 comfortably covers non-legendary Gen 1 stat spreads; 300 covers the
// vast majority of Gen 1 base_experience values.
const STAT_CEILING = 150;
const BASE_EXPERIENCE_CEILING = 300;
// Real PokeAPI stat name for each preference key the quiz can accumulate.
const STAT_NAME_BY_PREF_KEY: Record<string, string> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  speed: 'speed',
  specialAttack: 'special-attack',
};
const STAT_LABEL: Record<string, string> = {
  hp: 'sturdy HP',
  attack: 'powerful Attack',
  defense: 'strong Defense',
  speed: 'blazing Speed',
  specialAttack: 'sharp Special Attack',
};
// Max accumulated weight the quiz's own questions can realistically produce
// for the "balanced" style preference — used the same way STAT_CEILING is,
// purely to keep this bonus in scale with the other two score components.
const BALANCED_WEIGHT_CEILING = 15;

// Rule-based Starter Quiz scoring — no AI/LLM involved. Scores every Gen 1
// Pokémon against the user's accumulated QuizPreferenceProfile using real
// PokeAPI data (types, stats, base_experience) already served by the
// existing GET /api/pokemon endpoint, and returns the top 3.
@Injectable({ providedIn: 'root' })
export class QuizRecommendationService {
  private readonly pokemonService = inject(PokemonService);

  getRecommendations(profile: QuizPreferenceProfile): Observable<ScoredPokemon[]> {
    return this.loadGen1Pool().pipe(map((pool) => this.rank(pool, profile)));
  }

  // GET /api/pokemon already returns each entry with real stats (see
  // core/pokemon.ts) — 8 pages of 20 covers all of Gen 1 (ids 1-151) in 8
  // requests total, instead of 151 individual getById() calls.
  private loadGen1Pool(): Observable<PokemonSummary[]> {
    const pageCount = Math.ceil(GEN1_MAX_ID / PAGE_SIZE);
    const requests = Array.from({ length: pageCount }, (_, i) =>
      this.pokemonService.search({ sort: 'id', page: i + 1 }),
    );
    return forkJoin(requests).pipe(
      map((pages) => pages.flatMap((p) => p.results).filter((p) => p.id <= GEN1_MAX_ID)),
    );
  }

  private rank(pool: PokemonSummary[], profile: QuizPreferenceProfile): ScoredPokemon[] {
    const scored = pool.map((pokemon) => this.scoreOne(pokemon, profile));
    const maxScore = Math.max(1, ...scored.map((s) => s.score));

    scored.sort((a, b) =>
      b.score - a.score
      || b.typeScore - a.typeScore
      || b.pokemon.baseExperience - a.pokemon.baseExperience
      || a.pokemon.id - b.pokemon.id,
    );

    return scored.slice(0, 3).map((s) => ({
      pokemon: s.pokemon,
      score: s.score,
      matchPercent: Math.round(60 + (s.score / maxScore) * 39),
      reasons: s.reasons,
    }));
  }

  private scoreOne(
    pokemon: PokemonSummary,
    profile: QuizPreferenceProfile,
  ): { pokemon: PokemonSummary; score: number; typeScore: number; reasons: string[] } {
    let score = 0;

    // 1. Type match.
    let typeScore = 0;
    let bestType: { type: string; weight: number } | null = null;
    for (const type of pokemon.types) {
      const weight = profile.types[type] ?? 0;
      if (weight <= 0) continue;
      typeScore += weight * 10;
      if (!bestType || weight > bestType.weight) bestType = { type, weight };
    }
    score += typeScore;

    // 2. Stat match — normalized so no single stat dominates type match.
    let bestStat: { prefKey: string; contribution: number } | null = null;
    for (const [prefKey, statName] of Object.entries(STAT_NAME_BY_PREF_KEY)) {
      const weight = profile.stats[prefKey] ?? 0;
      if (weight <= 0) continue;
      const statValue = pokemon.stats.find((s) => s.name === statName)?.value ?? 0;
      const normalized = Math.min(statValue / STAT_CEILING, 1);
      const contribution = normalized * weight * 10;
      score += contribution;
      if (!bestStat || contribution > bestStat.contribution) bestStat = { prefKey, contribution };
    }

    // baseExperience preference is scored the same way but isn't a "stat"
    // in the PokeAPI sense, so it's handled separately.
    const bxWeight = profile.stats['baseExperience'] ?? 0;
    let bxContribution = 0;
    if (bxWeight > 0) {
      const normalized = Math.min(pokemon.baseExperience / BASE_EXPERIENCE_CEILING, 1);
      bxContribution = normalized * bxWeight * 10;
      score += bxContribution;
      if (!bestStat || bxContribution > bestStat.contribution) {
        bestStat = { prefKey: 'baseExperience', contribution: bxContribution };
      }
    }

    // 3. Balanced-style bonus — smaller spread between a Pokémon's highest
    // and lowest real stat means more "balanced".
    const balancedWeight = profile.style['balanced'] ?? 0;
    let balancedBonus = 0;
    if (balancedWeight > 0 && pokemon.stats.length > 0) {
      const values = pokemon.stats.map((s) => s.value);
      const spread = Math.max(...values) - Math.min(...values);
      balancedBonus = Math.max(0, 100 - spread) * (balancedWeight / BALANCED_WEIGHT_CEILING);
      score += balancedBonus;
    }

    return { pokemon, score, typeScore, reasons: this.buildReasons(bestType, bestStat, balancedBonus) };
  }

  // Reasons are derived from whichever factors actually scored highest for
  // THIS Pokémon under THIS user's preferences — never a fixed string tied
  // to a specific species.
  private buildReasons(
    bestType: { type: string; weight: number } | null,
    bestStat: { prefKey: string; contribution: number } | null,
    balancedBonus: number,
  ): string[] {
    const statPhrase = bestStat ? STAT_LABEL[bestStat.prefKey] : null;
    const typePhrase = bestType ? `${bestType.type}-type` : null;

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
}
