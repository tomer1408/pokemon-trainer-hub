import {
  getMissingTypes,
  getStrongestMember,
  getTeamPower,
  getTeamTier,
  getTypeCoverageInsight,
  getTypeSegments,
} from './team-power';

describe('getTeamPower', () => {
  it('sums baseExperience across the team', () => {
    expect(getTeamPower([{ baseExperience: 64 }, { baseExperience: 112 }])).toBe(176);
  });

  it('returns 0 for an empty team', () => {
    expect(getTeamPower([])).toBe(0);
  });

  it('treats a missing/falsy baseExperience as 0 instead of NaN', () => {
    expect(getTeamPower([{ baseExperience: 0 }, { baseExperience: 50 }])).toBe(50);
  });
});

describe('getStrongestMember', () => {
  it('returns null for an empty team', () => {
    expect(getStrongestMember([])).toBeNull();
  });

  it('picks the member with the highest baseExperience', () => {
    const weak = { name: 'weak', baseExperience: 30 };
    const strong = { name: 'strong', baseExperience: 200 };
    expect(getStrongestMember([weak, strong])).toBe(strong);
  });

  it('keeps the first member on a tie', () => {
    const first = { name: 'first', baseExperience: 100 };
    const second = { name: 'second', baseExperience: 100 };
    expect(getStrongestMember([first, second])).toBe(first);
  });
});

describe('getTeamTier', () => {
  it('maps team size to the right tier', () => {
    expect(getTeamTier(0)).toBe('Rookie');
    expect(getTeamTier(1)).toBe('Beginner');
    expect(getTeamTier(2)).toBe('Beginner');
    expect(getTeamTier(3)).toBe('Trainer');
    expect(getTeamTier(4)).toBe('Trainer');
    expect(getTeamTier(5)).toBe('Master');
  });
});

describe('getTypeSegments', () => {
  it('returns an empty array for an empty team', () => {
    expect(getTypeSegments([])).toEqual([]);
  });

  it('gives a single-type team 100%', () => {
    const segments = getTypeSegments([{ types: ['fire'] }, { types: ['fire'] }]);
    expect(segments).toEqual([{ type: 'fire', pct: 100 }]);
  });

  it('counts a dual-type member toward both types', () => {
    const segments = getTypeSegments([{ types: ['fire', 'flying'] }]);
    const byType = Object.fromEntries(segments.map((s) => [s.type, s.pct]));
    expect(byType['fire']).toBe(50);
    expect(byType['flying']).toBe(50);
  });

  it('always sums to exactly 100, even when independent rounding would not', () => {
    // Three equal thirds: naive rounding gives 33+33+33=99, not 100.
    const segments = getTypeSegments([{ types: ['fire'] }, { types: ['water'] }, { types: ['grass'] }]);
    const total = segments.reduce((sum, s) => sum + s.pct, 0);
    expect(total).toBe(100);
  });
});

describe('getMissingTypes', () => {
  it('returns the types not present on the team', () => {
    expect(getMissingTypes(['fire', 'water', 'grass'], ['fire'])).toEqual(['water', 'grass']);
  });

  it('returns an empty array when every type is covered', () => {
    expect(getMissingTypes(['fire', 'water'], ['fire', 'water'])).toEqual([]);
  });
});

describe('getTypeCoverageInsight', () => {
  it('returns an empty string for an empty team', () => {
    expect(getTypeCoverageInsight([], [])).toBe('');
  });

  it('calls out full coverage when nothing is missing', () => {
    expect(getTypeCoverageInsight(['fire'], [])).toContain('Full type coverage');
  });

  it('lists up to 3 missing types and flags there are more', () => {
    const insight = getTypeCoverageInsight(['fire'], ['water', 'grass', 'ice', 'rock']);
    expect(insight).toContain('water, grass, ice');
    expect(insight).toContain('and more');
  });
});
