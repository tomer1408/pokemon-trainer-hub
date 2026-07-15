import { QuizAnswer } from './quiz-questions';

export interface QuizPreferenceProfile {
  types: Record<string, number>;
  stats: Record<string, number>;
  style: Record<string, number>;
}

export function createEmptyProfile(): QuizPreferenceProfile {
  return { types: {}, stats: {}, style: {} };
}

function addWeights(target: Record<string, number>, source: Record<string, number> | undefined): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

// Folds every answer the user picked into one accumulated preference
// profile. Deliberately a pure, from-scratch fold over the FULL list of
// selected answers each time (not an incremental running total) — that way
// using Back to change an earlier answer just replaces one entry in the
// array, and re-running this function naturally "undoes" the old answer's
// contribution without needing any special subtract-it-back-out logic.
export function buildPreferenceProfile(selectedAnswers: (QuizAnswer | null)[]): QuizPreferenceProfile {
  const profile = createEmptyProfile();
  for (const answer of selectedAnswers) {
    if (!answer) continue;
    addWeights(profile.types, answer.weights.types);
    addWeights(profile.stats, answer.weights.stats);
    addWeights(profile.style, answer.weights.style);
  }
  return profile;
}

// Rescales one category's accumulated points so they sum to 1, preserving
// their relative importance (Fire=6/Electric=3/Water=1 becomes
// Fire=0.6/Electric=0.3/Water=0.1) — without this, a user whose answers
// happened to touch a category more often (e.g. 3 answers add to "stats" vs.
// 1 answer touching "style") gets an inflated signal in that category purely
// from raw point accumulation, not from how strongly they actually favored
// it. An empty or all-zero category safely returns zero weights (never NaN)
// instead of dividing by zero.
export function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return Object.fromEntries(Object.keys(weights).map((key) => [key, 0]));
  }
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total]));
}

// Normalizes types/stats/style independently — each category's own total is
// rescaled to 1, but the three categories are never normalized against each
// other (a profile with only 1 style answer and 4 type answers still ends up
// with both categories summing to 1 individually).
export function normalizeProfile(profile: QuizPreferenceProfile): QuizPreferenceProfile {
  return {
    types: normalizeWeights(profile.types),
    stats: normalizeWeights(profile.stats),
    style: normalizeWeights(profile.style),
  };
}
