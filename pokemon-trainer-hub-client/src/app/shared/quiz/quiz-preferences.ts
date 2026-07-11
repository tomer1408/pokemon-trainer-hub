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
