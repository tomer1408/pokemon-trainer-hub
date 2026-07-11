// The 18 canonical Pokémon types, plus the presentation/flavor data the AI
// Trainer Assistant needs to talk about type coverage. Kept in one place so
// any future screen (Explorer filters, My Team's type bar) can reuse it
// instead of re-declaring the type list.
export const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark',
  'steel', 'fairy',
] as const;

export type PokemonTypeName = (typeof POKEMON_TYPES)[number];

// The standard Pokédex type-color palette, used for the small type badges.
export const TYPE_COLORS: Record<PokemonTypeName, string> = {
  normal: '#A8A878', fire: '#F08030', water: '#6890F0', electric: '#F8D030',
  grass: '#78C850', ice: '#98D8D8', fighting: '#C03028', poison: '#A040A0',
  ground: '#E0C068', flying: '#A890F0', psychic: '#F85888', bug: '#A8B820',
  rock: '#B8A038', ghost: '#705898', dragon: '#7038F8', dark: '#705848',
  steel: '#B8B8D0', fairy: '#EE99AC',
};

