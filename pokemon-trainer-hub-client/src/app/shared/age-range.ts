// Mirrors the same logic in the server's routes/profile.js (calculateAge/
// calculateAgeRange) — kept as a client-side duplicate for instant feedback,
// same as this app's other duplicated-on-both-sides constants (POKEMON_TYPES/
// EXPERIENCE_LEVELS). The server always re-derives and validates this itself;
// nothing computed here is ever trusted as-is.
export const MIN_AGE = 13;

export type AgeRange = '13-17' | '18-24' | '25-34' | '35+';

export function calculateAge(dobIso: string, now = new Date()): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;

  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function calculateAgeRange(dobIso: string, now = new Date()): AgeRange | null {
  const age = calculateAge(dobIso, now);
  if (age == null || age < 0) return null;
  if (age < 18) return '13-17';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  return '35+';
}

export function isBelowMinAge(dobIso: string, now = new Date()): boolean {
  const age = calculateAge(dobIso, now);
  return age != null && age < MIN_AGE;
}

export function isFutureDate(dobIso: string, now = new Date()): boolean {
  if (!dobIso) return false;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return false;
  return dob.getTime() > now.getTime();
}
