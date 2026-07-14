// One-time import: resolves a curated list of real PokeAPI species/items by
// NAME (never a guessed dex number, so a typo fails loudly instead of
// silently importing the wrong sprite) and upserts them into AvatarIcon —
// a shared reference table every trainer's avatar picker reads from,
// replacing the old "fetch 16 icons live from PokeAPI on every page load"
// approach. Safe to re-run (upserts on the unique pokemonId).
//
// Run manually: node scripts/seed-avatar-icons.js
require('dotenv').config({ quiet: true });
const prisma = require('../services/prisma');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// Real Pokédex ids for the 5 "General" item icons aren't a thing (they're
// items, not Pokémon) — negative sentinels instead, per schema.prisma's
// comment on AvatarIcon.pokemonId.
const CATEGORIES = [
  { category: 'popular', kind: 'pokemon', names: ['pikachu', 'charizard', 'mewtwo', 'eevee', 'gengar'] },
  { category: 'fire', kind: 'pokemon', names: ['charmander', 'vulpix', 'growlithe', 'ninetales', 'flareon'] },
  { category: 'water', kind: 'pokemon', names: ['squirtle', 'blastoise', 'vaporeon', 'psyduck', 'lapras'] },
  { category: 'electric', kind: 'pokemon', names: ['raichu', 'jolteon', 'electabuzz', 'zapdos', 'magnemite'] },
  { category: 'grass', kind: 'pokemon', names: ['bulbasaur', 'venusaur', 'oddish', 'bellsprout', 'tangela'] },
  { category: 'general', kind: 'item', names: ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'premier-ball'] },
];

async function fetchPokemon(name) {
  const res = await fetch(`${POKEAPI_BASE}/pokemon/${name}`);
  if (!res.ok) throw new Error(`pokemon "${name}" -> HTTP ${res.status}`);
  const data = await res.json();
  const spriteUrl = data.sprites.other?.['official-artwork']?.front_default ?? data.sprites.front_default;
  if (!spriteUrl) throw new Error(`pokemon "${name}" has no sprite`);
  return { pokemonId: data.id, name: data.name, spriteUrl };
}

// The item endpoint's own `sprites.default` is a tiny 30x30 pixel-art icon
// that looks blocky once scaled up in the picker. The PokeAPI/sprites repo's
// "dream-world" set has the same Poké Balls as clean 90x90 flat-vector art —
// still the real PokeAPI asset repo, just a higher-quality folder within it.
const DREAM_WORLD_ITEMS_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world';

async function fetchItem(name, sentinelId) {
  const res = await fetch(`${POKEAPI_BASE}/item/${name}`);
  if (!res.ok) throw new Error(`item "${name}" -> HTTP ${res.status}`);
  const data = await res.json();
  const spriteUrl = `${DREAM_WORLD_ITEMS_BASE}/${name}.png`;
  const check = await fetch(spriteUrl, { method: 'HEAD' });
  if (!check.ok) throw new Error(`item "${name}" has no dream-world sprite`);
  return { pokemonId: sentinelId, name: data.name, spriteUrl };
}

async function main() {
  let created = 0;
  let updated = 0;
  const failed = [];

  for (const group of CATEGORIES) {
    for (let i = 0; i < group.names.length; i++) {
      const name = group.names[i];
      try {
        const resolved =
          group.kind === 'pokemon' ? await fetchPokemon(name) : await fetchItem(name, -(i + 1));

        const existing = await prisma.avatarIcon.findUnique({ where: { pokemonId: resolved.pokemonId } });
        await prisma.avatarIcon.upsert({
          where: { pokemonId: resolved.pokemonId },
          create: {
            pokemonId: resolved.pokemonId,
            name: resolved.name,
            category: group.category,
            spriteUrl: resolved.spriteUrl,
            sortOrder: i,
          },
          update: {
            name: resolved.name,
            category: group.category,
            spriteUrl: resolved.spriteUrl,
            sortOrder: i,
          },
        });
        existing ? updated++ : created++;
        console.log(`  ok  ${group.category}/${name} -> id ${resolved.pokemonId}`);
      } catch (err) {
        failed.push({ category: group.category, name, error: err.message });
        console.error(`FAIL  ${group.category}/${name} -> ${err.message}`);
      }
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated, ${failed.length} failed.`);
  if (failed.length) {
    console.log('Failed entries:', failed);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
