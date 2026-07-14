// Fixed display order for the avatar-icon picker's category pills — not
// alphabetical, chosen order (Popular first, General last). Shared between
// Onboarding and Profile so both pickers stay in sync if this ever changes.
export const AVATAR_CATEGORY_ORDER = ['popular', 'general', 'fire', 'water', 'electric', 'grass'] as const;

export const AVATAR_CATEGORY_LABELS: Record<string, string> = {
  popular: 'Popular',
  fire: 'Fire',
  water: 'Water',
  electric: 'Electric',
  grass: 'Grass',
  general: 'General',
};
