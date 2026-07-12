import { TypeChart } from '../core/pokemon';
import { getBattleReadiness, getTeamMatchup } from './team-matchup';

// A small, self-contained chart — not the real 18-type PokeAPI chart, just
// enough entries to exercise the merge/overlap/counting logic in isolation.
const CHART: TypeChart = {
  fire: { weak: ['water', 'rock'], resist: ['grass', 'fire'], strong: ['grass', 'ice'] },
  water: { weak: ['grass'], resist: ['fire', 'water'], strong: ['fire', 'rock'] },
  grass: { weak: ['fire', 'ice'], resist: ['water', 'grass'], strong: ['water', 'rock'] },
  // Deliberately overlapping: rock is both "weak" and "resist" for flying —
  // exercises the drop-the-overlap simplification.
  flying: { weak: ['rock', 'electric'], resist: ['rock', 'grass'], strong: ['grass'] },
};

describe('getTeamMatchup', () => {
  it('returns empty results for an empty team', () => {
    expect(getTeamMatchup([], CHART)).toEqual({ strongAgainst: [], vulnerableTo: [] });
  });

  it('unions strongAgainst across all present types', () => {
    const result = getTeamMatchup([{ types: ['fire'] }, { types: ['water'] }], CHART);
    expect(new Set(result.strongAgainst)).toEqual(new Set(['grass', 'ice', 'fire', 'rock']));
  });

  it('counts each member once per real weak type', () => {
    const result = getTeamMatchup([{ types: ['fire'] }, { types: ['water'] }], CHART);
    const byType = Object.fromEntries(result.vulnerableTo.map((v) => [v.type, v.count]));
    // fire is weak to water+rock; water is weak to grass — no shared weak type here.
    expect(byType['water']).toBe(1);
    expect(byType['rock']).toBe(1);
    expect(byType['grass']).toBe(1);
  });

  it('increments the count when multiple members share a weak type', () => {
    const result = getTeamMatchup([{ types: ['fire'] }, { types: ['fire'] }], CHART);
    const byType = Object.fromEntries(result.vulnerableTo.map((v) => [v.type, v.count]));
    expect(byType['water']).toBe(2);
  });

  it('drops a type from weak when the member also resists it (dual-type overlap)', () => {
    // flying: weak to [rock, electric], resists [rock, grass] — rock should
    // cancel out, leaving only electric.
    const result = getTeamMatchup([{ types: ['flying'] }], CHART);
    const types = result.vulnerableTo.map((v) => v.type);
    expect(types).not.toContain('rock');
    expect(types).toContain('electric');
  });

  it('sorts vulnerableTo by count descending', () => {
    const result = getTeamMatchup(
      [{ types: ['fire'] }, { types: ['fire'] }, { types: ['water'] }],
      CHART,
    );
    const counts = result.vulnerableTo.map((v) => v.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});

describe('getBattleReadiness', () => {
  it('returns all zeros and the early-days verdict for an empty team', () => {
    const readiness = getBattleReadiness([], CHART);
    expect(readiness.score).toBe(0);
    expect(readiness.offense).toBe(0);
    expect(readiness.coverage).toBe(0);
    expect(readiness.balance).toBe(0);
    expect(readiness.verdict).toContain('Early days');
  });

  it('caps offense at 100 even when average power exceeds the ceiling', () => {
    const readiness = getBattleReadiness([{ types: ['fire'], baseExperience: 999 }], CHART);
    expect(readiness.offense).toBe(100);
  });

  it('scores full power evenness when all members have identical power', () => {
    const even = getBattleReadiness(
      [
        { types: ['fire'], baseExperience: 200 },
        { types: ['water'], baseExperience: 200 },
      ],
      CHART,
    );
    const uneven = getBattleReadiness(
      [
        { types: ['fire'], baseExperience: 400 },
        { types: ['water'], baseExperience: 10 },
      ],
      CHART,
    );
    // Same average power (and same type diversity) in both cases — only the
    // spread differs, so the even team's balance score must be strictly higher.
    expect(even.balance).toBeGreaterThan(uneven.balance);
  });

  it('rewards type diversity in the balance score', () => {
    const diverse = getBattleReadiness(
      [
        { types: ['fire'], baseExperience: 100 },
        { types: ['water'], baseExperience: 100 },
      ],
      CHART,
    );
    const uniform = getBattleReadiness(
      [
        { types: ['fire'], baseExperience: 100 },
        { types: ['fire'], baseExperience: 100 },
      ],
      CHART,
    );
    expect(diverse.balance).toBeGreaterThan(uniform.balance);
  });

  it('blends offense/coverage/balance into the overall score using the documented weights', () => {
    const readiness = getBattleReadiness([{ types: ['fire'], baseExperience: 160 }], CHART);
    const expected = Math.round(readiness.offense * 0.4 + readiness.coverage * 0.35 + readiness.balance * 0.25);
    expect(readiness.score).toBe(expected);
  });
});
