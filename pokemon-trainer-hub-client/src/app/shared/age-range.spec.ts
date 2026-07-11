import { calculateAge, calculateAgeRange, isBelowMinAge, isFutureDate } from './age-range';

// Fixed "now" so every test is deterministic regardless of when it runs.
const NOW = new Date('2026-07-11T00:00:00.000Z');

describe('calculateAge', () => {
  it('returns null for an empty/invalid date', () => {
    expect(calculateAge('', NOW)).toBeNull();
    expect(calculateAge('not-a-date', NOW)).toBeNull();
  });

  it('computes a whole number of years', () => {
    expect(calculateAge('2001-07-11T00:00:00.000Z', NOW)).toBe(25);
  });

  it("doesn't count this year's birthday until it's actually passed", () => {
    // Birthday is two days after "now" — should still read as the age
    // before the birthday, not after.
    expect(calculateAge('2001-07-13T00:00:00.000Z', NOW)).toBe(24);
  });
});

describe('calculateAgeRange', () => {
  it('buckets a 13-17 year old correctly', () => {
    expect(calculateAgeRange('2011-01-01T00:00:00.000Z', NOW)).toBe('13-17');
  });

  it('buckets an 18-24 year old correctly', () => {
    expect(calculateAgeRange('2005-01-01T00:00:00.000Z', NOW)).toBe('18-24');
  });

  it('buckets a 25-34 year old correctly', () => {
    expect(calculateAgeRange('1995-01-01T00:00:00.000Z', NOW)).toBe('25-34');
  });

  it('buckets a 35+ year old correctly', () => {
    expect(calculateAgeRange('1980-01-01T00:00:00.000Z', NOW)).toBe('35+');
  });

  it('returns null for an invalid date', () => {
    expect(calculateAgeRange('garbage', NOW)).toBeNull();
  });
});

describe('isBelowMinAge', () => {
  it('flags a 12 year old as below the minimum', () => {
    expect(isBelowMinAge('2014-01-01T00:00:00.000Z', NOW)).toBe(true);
  });

  it('does not flag exactly the minimum age', () => {
    expect(isBelowMinAge('2013-01-01T00:00:00.000Z', NOW)).toBe(false);
  });
});

describe('isFutureDate', () => {
  it('flags a date after now', () => {
    expect(isFutureDate('2026-07-13T00:00:00.000Z', NOW)).toBe(true);
  });

  it('does not flag a date before now', () => {
    expect(isFutureDate('2001-07-11T00:00:00.000Z', NOW)).toBe(false);
  });

  it('does not flag an empty date', () => {
    expect(isFutureDate('', NOW)).toBe(false);
  });
});
