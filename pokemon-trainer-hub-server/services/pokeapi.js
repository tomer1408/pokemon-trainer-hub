const NodeCache = require('node-cache');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// Caches PokeAPI responses in memory so repeated lookups of the same
// Pokémon (or list) don't hit the external API every time.
const pokeCache = new NodeCache({ stdTTL: 3600 });

// Fetches one Pokémon's details (cached). Returns null if PokeAPI says 404,
// throws if PokeAPI itself is unreachable/erroring.
async function fetchPokemonDetail(idOrName) {
  const key = String(idOrName).toLowerCase();
  const cached = pokeCache.get(`pokemon:${key}`);
  if (cached) return cached;

  const response = await fetch(`${POKEAPI_BASE}/pokemon/${key}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PokeAPI responded with ${response.status}`);

  const data = await response.json();
  const pokemon = {
    id: data.id,
    name: data.name,
    baseExperience: data.base_experience,
    stats: data.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
    types: data.types.map((t) => t.type.name),
    abilities: data.abilities.map((a) => a.ability.name),
    spriteUrl: data.sprites.front_default,
    cry: data.cries?.latest ?? data.cries?.legacy ?? null,
  };

  pokeCache.set(`pokemon:${key}`, pokemon);
  return pokemon;
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

module.exports = { fetchPokemonDetail, getMasterList, getListByType };
