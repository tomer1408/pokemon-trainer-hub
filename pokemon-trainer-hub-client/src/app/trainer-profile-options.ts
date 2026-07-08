export const POKEMON_TYPES = ['Fire', 'Water', 'Grass', 'Electric'] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
