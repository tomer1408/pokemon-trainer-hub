import { matchTypeFromDescription } from './pokemon-types';

describe('matchTypeFromDescription', () => {
  it('matches a straightforward keyword', () => {
    expect(matchTypeFromDescription('something fiery and hot')).toBe('fire');
  });

  it('is case-insensitive', () => {
    expect(matchTypeFromDescription('FAST and AGILE')).toBe('electric');
  });

  it('returns null when nothing matches', () => {
    expect(matchTypeFromDescription('purple and round')).toBeNull();
  });

  it('returns null for an empty description', () => {
    expect(matchTypeFromDescription('')).toBeNull();
  });

  it('resolves to the first matching entry when multiple keywords are present', () => {
    // "fast" (electric) is checked before "aquatic" (water) in TYPE_KEYWORDS.
    expect(matchTypeFromDescription('fast and aquatic')).toBe('electric');
  });
});
