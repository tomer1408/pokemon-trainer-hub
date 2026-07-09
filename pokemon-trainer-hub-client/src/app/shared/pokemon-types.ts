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

// Why the assistant would recommend filling this type gap — short, generic
// matchup flavor text (not meant to be a rigorous type-effectiveness engine).
export const TYPE_RECOMMENDATION_REASON: Record<PokemonTypeName, string> = {
  normal: "Versatile and reliable — a safe pick in almost any matchup.",
  fire: 'Hits hard and threatens Grass, Ice, Bug, and Steel-type opponents.',
  water: 'A balanced pick that covers Fire, Ground, and Rock-type threats.',
  electric: 'Outspeeds most of the field and covers Water and Flying-type threats.',
  grass: 'Covers Water, Ground, and Rock-type threats, though it stays fragile against Fire.',
  ice: 'One of the best answers to Grass, Ground, Flying, and Dragon-type threats.',
  fighting: 'Raw physical power that covers Normal, Rock, Steel, Ice, and Dark-type threats.',
  poison: 'Handles Grass and Fairy-type threats and helps control the board with status.',
  ground: 'A strong defensive pick that covers Fire, Electric, Poison, Rock, and Steel-type threats.',
  flying: 'Adds mobility and covers Grass, Fighting, and Bug-type threats.',
  psychic: 'High Special Attack that covers Fighting and Poison-type threats.',
  bug: 'Covers Grass, Psychic, and Dark-type threats and comes online early.',
  rock: 'Excellent physical bulk that covers Fire, Ice, Flying, and Bug-type threats.',
  ghost: "Hard to pin down defensively, and it's the only real answer to other Ghost-types.",
  dragon: 'Elite raw power, mostly useful against other Dragon-type threats.',
  dark: 'Covers Psychic and Ghost-type threats and resists most special attacks.',
  steel: 'Exceptional defensive typing that resists more types than any other.',
  fairy: 'Covers Dragon, Dark, and Fighting-type threats that give physical teams trouble.',
};

// "Find by Description" keyword matcher — first matching entry wins.
export const TYPE_KEYWORDS: { type: PokemonTypeName; words: string[] }[] = [
  { type: 'electric', words: ['fast', 'speed', 'quick', 'agile', 'electric', 'lightning', 'volt'] },
  { type: 'rock', words: ['defens', 'tank', 'durable', 'tough', 'sturdy'] },
  { type: 'fighting', words: ['strong', 'attack', 'power', 'hit hard'] },
  { type: 'water', words: ['water', 'aquatic', 'swim'] },
  { type: 'psychic', words: ['smart', 'mind', 'psychic'] },
  { type: 'ice', words: ['ice', 'cold', 'frost', 'snow'] },
  { type: 'flying', words: ['fly', 'flying', 'sky', 'air'] },
  { type: 'dark', words: ['dark', 'shadow', 'sneaky', 'night'] },
  { type: 'grass', words: ['grass', 'plant', 'nature', 'leaf'] },
  { type: 'fire', words: ['fire', 'hot', 'flame', 'burn'] },
  { type: 'poison', words: ['poison', 'toxic', 'venom'] },
  { type: 'ground', words: ['ground', 'earth', 'dig', 'burrow'] },
  { type: 'bug', words: ['bug', 'insect'] },
  { type: 'dragon', words: ['dragon', 'mythical', 'legendary'] },
  { type: 'ghost', words: ['ghost', 'spooky', 'phantom', 'haunt'] },
  { type: 'steel', words: ['steel', 'metal', 'armor', 'armour'] },
  { type: 'fairy', words: ['fairy', 'cute', 'charm', 'pretty'] },
  { type: 'normal', words: ['normal', 'plain', 'balanced', 'all-around', 'all rounder'] },
];

export function matchTypeFromDescription(text: string): PokemonTypeName | null {
  const lower = text.toLowerCase();
  const match = TYPE_KEYWORDS.find((entry) => entry.words.some((w) => lower.includes(w)));
  return match?.type ?? null;
}
