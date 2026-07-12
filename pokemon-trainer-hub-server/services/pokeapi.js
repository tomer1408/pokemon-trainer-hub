const NodeCache = require('node-cache');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// Caches PokeAPI responses in memory so repeated lookups of the same
// Pokémon (or list) don't hit the external API every time.
const pokeCache = new NodeCache({ stdTTL: 3600 });

// Raw PokeAPI pokemon payload, cached separately from the cleaned-up shape
// below — fetchTopMoves also needs fields (the full `moves` list) that the
// cleaned object doesn't keep, so both reuse this instead of double-fetching.
async function fetchRawPokemon(idOrName) {
  const key = String(idOrName).toLowerCase();
  const cached = pokeCache.get(`pokemonraw:${key}`);
  if (cached) return cached;

  const response = await fetch(`${POKEAPI_BASE}/pokemon/${key}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PokeAPI responded with ${response.status}`);

  const data = await response.json();
  pokeCache.set(`pokemonraw:${key}`, data);
  return data;
}

// Fetches one Pokémon's details (cached). Returns null if PokeAPI says 404,
// throws if PokeAPI itself is unreachable/erroring.
async function fetchPokemonDetail(idOrName) {
  const key = String(idOrName).toLowerCase();
  const cached = pokeCache.get(`pokemon:${key}`);
  if (cached) return cached;

  const data = await fetchRawPokemon(idOrName);
  if (!data) return null;

  const pokemon = {
    id: data.id,
    name: data.name,
    baseExperience: data.base_experience,
    stats: data.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
    types: data.types.map((t) => t.type.name),
    abilities: data.abilities.map((a) => a.ability.name),
    // Official artwork is a large, clean render — much sharper than the tiny
    // 96x96 pixel-art front sprite. Falls back to the sprite if missing.
    spriteUrl: data.sprites.other?.['official-artwork']?.front_default ?? data.sprites.front_default,
    cry: data.cries?.latest ?? data.cries?.legacy ?? null,
    // PokeAPI reports these in decimetres/hectograms — converted to metres/kg,
    // free fields already present on this same payload (no extra request).
    height: data.height / 10,
    weight: data.weight / 10,
  };

  pokeCache.set(`pokemon:${key}`, pokemon);
  return pokemon;
}

// English flavor text for the Detail Modal — a separate PokeAPI endpoint, so
// this is only called for a single Pokémon's full detail, not for list views.
// Degrades to null (no flavor text) on any failure — a flaky PokeAPI response
// here shouldn't take down the rest of the Detail Modal's data (sprite,
// stats, abilities, etc. are fetched independently and should still show).
async function fetchSpeciesFlavorText(idOrName) {
  const key = String(idOrName).toLowerCase();
  const cached = pokeCache.get(`species:${key}`);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(`${POKEAPI_BASE}/pokemon-species/${key}`);
    if (!response.ok) {
      if (response.status === 404) pokeCache.set(`species:${key}`, null);
      return null;
    }

    const data = await response.json();
    const entry = data.flavor_text_entries.find((e) => e.language.name === 'en');
    // Flavor text entries use \n / \f as line-break control characters.
    const flavorText = entry ? entry.flavor_text.replace(/[\n\f\r]+/g, ' ') : null;

    pokeCache.set(`species:${key}`, flavorText);
    return flavorText;
  } catch {
    return null;
  }
}

// One type's raw weak-against / resistant-against / strong-against lists —
// cached per type (not per Pokémon), since every Pokémon sharing a type
// reuses the same data. Degrades to an empty result on failure — same
// reasoning as fetchSpeciesFlavorText.
async function fetchSingleTypeMatchup(typeName) {
  const key = typeName.toLowerCase();
  const cached = pokeCache.get(`typematchup:${key}`);
  if (cached) return cached;

  try {
    const response = await fetch(`${POKEAPI_BASE}/type/${key}`);
    if (!response.ok) return { weak: [], resist: [], strong: [] };

    const data = await response.json();
    const result = {
      weak: data.damage_relations.double_damage_from.map((t) => t.name),
      resist: [
        ...data.damage_relations.half_damage_from.map((t) => t.name),
        ...data.damage_relations.no_damage_from.map((t) => t.name),
      ],
      // Types this type deals double damage TO (an offense, not defense,
      // list) — used by the My Team page's team-wide "Strong Against".
      strong: data.damage_relations.double_damage_to.map((t) => t.name),
    };

    pokeCache.set(`typematchup:${key}`, result, 86400);
    return result;
  } catch {
    return { weak: [], resist: [], strong: [] };
  }
}

// All 18 real Pokémon types' weak/resist/strong lists in one shape — powers
// My Team's Battle Readiness / Matchup Analysis cards, which need real
// team-wide type effectiveness, not per-Pokémon detail. Each type is cached
// individually (see above), so this is only ever slow on a fully cold cache.
const ALL_TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark',
  'steel', 'fairy',
];
async function getTypeChart() {
  const entries = await Promise.all(
    ALL_TYPE_NAMES.map(async (name) => [name, await fetchSingleTypeMatchup(name)]),
  );
  return Object.fromEntries(entries);
}

// Merges weak/resist lists across a Pokémon's 1-2 types. Simplification: a
// type that ends up both weak-against and resistant-against (possible for
// dual-types, since real effectiveness multiplies per-type) is dropped from
// both rather than computing the exact 4x/2x/0.5x/0.25x multiplier — good
// enough for a badge display, not a battle-accuracy engine.
async function fetchTypeMatchups(typeNames) {
  const perType = await Promise.all(typeNames.map(fetchSingleTypeMatchup));
  const weak = new Set();
  const resist = new Set();
  for (const t of perType) {
    t.weak.forEach((w) => weak.add(w));
    t.resist.forEach((r) => resist.add(r));
  }
  return {
    weaknesses: [...weak].filter((t) => !resist.has(t)),
    resistances: [...resist].filter((t) => !weak.has(t)),
  };
}

// A single ability's English short effect text — cached per ability name,
// since many Pokémon share the same ability.
async function fetchAbilityDescription(abilityName) {
  const key = abilityName.toLowerCase();
  const cached = pokeCache.get(`ability:${key}`);
  if (cached !== undefined) return cached;

  const response = await fetch(`${POKEAPI_BASE}/ability/${key}`);
  if (!response.ok) {
    pokeCache.set(`ability:${key}`, null);
    return null;
  }

  const data = await response.json();
  const entry = data.effect_entries.find((e) => e.language.name === 'en');
  const description = entry ? entry.short_effect || entry.effect : null;

  pokeCache.set(`ability:${key}`, description, 86400);
  return description;
}

async function fetchAbilitiesWithDescriptions(abilityNames) {
  const descriptions = await Promise.all(abilityNames.map(fetchAbilityDescription));
  return abilityNames.map((name, i) => ({ name, description: descriptions[i] }));
}

// A single move's type + power — cached per move name, since many Pokémon
// share moves (e.g. Tackle, Quick Attack).
async function fetchMoveDetail(moveName) {
  const key = moveName.toLowerCase();
  const cached = pokeCache.get(`move:${key}`);
  if (cached !== undefined) return cached;

  const response = await fetch(`${POKEAPI_BASE}/move/${key}`);
  if (!response.ok) {
    pokeCache.set(`move:${key}`, null);
    return null;
  }

  const data = await response.json();
  const move = { name: data.name, type: data.type.name, power: data.power };
  pokeCache.set(`move:${key}`, move, 86400);
  return move;
}

// Picks the Pokémon's real level-up moves, favoring higher-level ones as a
// proxy for "strongest" (PokeAPI has no single "best move" field), fetches
// each move's real type/power, drops status moves (power: null since they
// don't deal damage), and returns up to 5 sorted by power. A ~1300-species
// full "actual highest-power move" ranking would mean fetching every move a
// Pokémon can learn (some know 100+) — this checks a bounded top-8 slice by
// level instead, so opening the modal doesn't send that many requests.
async function fetchTopMoves(idOrName) {
  const data = await fetchRawPokemon(idOrName);
  if (!data) return [];

  const levelUpCandidates = data.moves
    .map((m) => {
      const detail = m.version_group_details.find((d) => d.move_learn_method.name === 'level-up');
      return detail ? { name: m.move.name, level: detail.level_learned_at } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.level - a.level)
    .slice(0, 8);

  const detailed = await Promise.all(levelUpCandidates.map((m) => fetchMoveDetail(m.name)));
  return detailed
    .filter((m) => m && typeof m.power === 'number')
    .sort((a, b) => b.power - a.power)
    .slice(0, 5);
}

// The enriched shape the Pokémon Detail Modal needs — flavor text, type
// matchups, ability descriptions, and top moves on top of fetchPokemonDetail's
// fields. Kept as a separate function (used only by the single-item
// GET /api/pokemon/:id route) so the list view (GET /api/pokemon) doesn't pay
// for the extra PokeAPI calls these need.
async function fetchPokemonFullDetail(idOrName) {
  const base = await fetchPokemonDetail(idOrName);
  if (!base) return null;

  const [flavorText, matchups, abilities, topMoves] = await Promise.all([
    fetchSpeciesFlavorText(base.id),
    fetchTypeMatchups(base.types),
    fetchAbilitiesWithDescriptions(base.abilities),
    fetchTopMoves(base.id),
  ]);

  return {
    ...base,
    flavorText,
    weaknesses: matchups.weaknesses,
    resistances: matchups.resistances,
    abilities,
    topMoves,
  };
}

// Full list of { id, name } for every Pokémon — cached for 24h, it basically never changes.
async function getMasterList() {
  const cached = pokeCache.get('list:all');
  if (cached) return cached;

  const response = await fetch(`${POKEAPI_BASE}/pokemon?limit=2000`);
  if (!response.ok) throw new Error(`PokeAPI responded with ${response.status}`);

  const data = await response.json();
  const list = data.results.map((r) => ({
    id: Number(r.url.match(/\/pokemon\/(\d+)\//)[1]),
    name: r.name,
  }));

  pokeCache.set('list:all', list, 86400);
  return list;
}

// { id, name } list scoped to a single type — cached for 24h. Returns null if the type doesn't exist.
async function getListByType(type) {
  const key = type.toLowerCase();
  const cached = pokeCache.get(`list:type:${key}`);
  if (cached) return cached;

  const response = await fetch(`${POKEAPI_BASE}/type/${key}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PokeAPI responded with ${response.status}`);

  const data = await response.json();
  const list = data.pokemon.map((p) => ({
    id: Number(p.pokemon.url.match(/\/pokemon\/(\d+)\//)[1]),
    name: p.pokemon.name,
  }));

  pokeCache.set(`list:type:${key}`, list, 86400);
  return list;
}

module.exports = { fetchPokemonDetail, fetchPokemonFullDetail, getMasterList, getListByType, getTypeChart };
