import { QuizAnswer } from './quiz-questions';
import { buildPreferenceProfile, normalizeProfile, normalizeWeights } from './quiz-preferences';

function answer(weights: QuizAnswer['weights']): QuizAnswer {
  return { id: 'a', label: 'a', weights };
}

describe('buildPreferenceProfile', () => {
  it('accumulates weights across every selected answer', () => {
    const profile = buildPreferenceProfile([
      answer({ types: { fire: 2 }, stats: { attack: 3 } }),
      answer({ types: { fire: 1, water: 1 } }),
    ]);
    expect(profile.types).toEqual({ fire: 3, water: 1 });
    expect(profile.stats).toEqual({ attack: 3 });
  });

  it('ignores null answers (unanswered questions)', () => {
    const profile = buildPreferenceProfile([answer({ types: { fire: 1 } }), null]);
    expect(profile.types).toEqual({ fire: 1 });
  });

  it('re-derives from scratch, so replacing an earlier answer replaces its contribution instead of adding to it', () => {
    const first = buildPreferenceProfile([answer({ types: { fire: 5 } })]);
    const replaced = buildPreferenceProfile([answer({ types: { water: 5 } })]);
    expect(first.types).toEqual({ fire: 5 });
    expect(replaced.types).toEqual({ water: 5 });
  });
});

describe('normalizeWeights', () => {
  it('rescales so the category sums to 1, preserving relative importance', () => {
    const result = normalizeWeights({ fire: 6, electric: 3, water: 1 });
    expect(result['fire']).toBeCloseTo(0.6);
    expect(result['electric']).toBeCloseTo(0.3);
    expect(result['water']).toBeCloseTo(0.1);
  });

  it('sums to approximately 1', () => {
    const result = normalizeWeights({ a: 4, b: 7, c: 2 });
    const total = Object.values(result).reduce((sum, v) => sum + v, 0);
    expect(total).toBeCloseTo(1);
  });

  it('returns zero weights for an empty category instead of NaN', () => {
    const result = normalizeWeights({});
    expect(result).toEqual({});
  });

  it('returns zero weights (not NaN) when every entry is zero', () => {
    const result = normalizeWeights({ fire: 0, water: 0 });
    expect(result).toEqual({ fire: 0, water: 0 });
    expect(Number.isNaN(result['fire'])).toBe(false);
  });

  it('handles a single-key category as 1', () => {
    expect(normalizeWeights({ balanced: 4 })).toEqual({ balanced: 1 });
  });
});

describe('normalizeProfile', () => {
  it('normalizes types, stats, and style independently', () => {
    const result = normalizeProfile({
      types: { fire: 3, water: 1 },
      stats: { attack: 1 },
      style: {},
    });
    expect(result.types['fire']).toBeCloseTo(0.75);
    expect(result.types['water']).toBeCloseTo(0.25);
    expect(result.stats['attack']).toBe(1);
    expect(result.style).toEqual({});
  });
});
