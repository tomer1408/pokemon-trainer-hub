const prisma = require('./prisma');
const { fetchPokemonDetail } = require('./pokeapi');
const ServiceError = require('./serviceError');

const MAX_TEAM_SIZE = 5;

// The current user's Dream Team, enriched with stats/types (needed for Team
// Power and the type-distribution bar on the client).
async function getTeam(auth0UserId) {
  const members = await prisma.dreamTeamMember.findMany({
    where: { auth0UserId },
    orderBy: { addedAt: 'asc' },
  });

  return Promise.all(
    members.map(async (member) => {
      let detail = null;
      try {
        detail = await fetchPokemonDetail(member.pokemonId);
      } catch (err) {
        // PokeAPI being briefly down shouldn't break the whole team screen —
        // the member still shows up, just without stats/types for now.
      }

      return {
        pokemonId: member.pokemonId,
        pokemonName: member.pokemonName,
        spriteUrl: member.spriteUrl,
        addedAt: member.addedAt,
        stats: detail?.stats ?? [],
        types: detail?.types ?? [],
        baseExperience: detail?.baseExperience ?? 0,
      };
    })
  );
}

// Adds a Pokémon to the team. Throws ServiceError('DUPLICATE' | 'TEAM_FULL' | 'NOT_FOUND' | 'UPSTREAM_ERROR').
async function addToTeam(auth0UserId, pokemonId) {
  const existing = await prisma.dreamTeamMember.findUnique({
    where: { auth0UserId_pokemonId: { auth0UserId, pokemonId } },
  });

  if (existing) {
    throw new ServiceError('DUPLICATE', `${existing.pokemonName} is already in your team.`);
  }

  const currentCount = await prisma.dreamTeamMember.count({ where: { auth0UserId } });
  if (currentCount >= MAX_TEAM_SIZE) {
    throw new ServiceError('TEAM_FULL', 'Your Dream Team is already full (5/5).');
  }

  let pokemon;
  try {
    pokemon = await fetchPokemonDetail(pokemonId);
  } catch (err) {
    throw new ServiceError('UPSTREAM_ERROR', 'PokeAPI is unavailable. Please try again later.');
  }

  if (!pokemon) {
    throw new ServiceError('NOT_FOUND', 'Pokémon not found.');
  }

  const member = await prisma.dreamTeamMember.create({
    data: {
      auth0UserId,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
    },
  });

  return { message: `${pokemon.name} joined your Dream Team!`, member };
}

// Removing something that was never there is not an error (idempotent).
async function removeFromTeam(auth0UserId, pokemonId) {
  await prisma.dreamTeamMember.deleteMany({ where: { auth0UserId, pokemonId } });
}

// Swaps one real DB write (remove + add as a single transaction) instead of
// two separate client calls — used by the Team Swap Modal when the team is
// already full. Throws ServiceError('NOT_FOUND' | 'DUPLICATE' | 'UPSTREAM_ERROR').
async function swapTeamMember(auth0UserId, removePokemonId, addPokemonId) {
  const toRemove = await prisma.dreamTeamMember.findUnique({
    where: { auth0UserId_pokemonId: { auth0UserId, pokemonId: removePokemonId } },
  });
  if (!toRemove) {
    throw new ServiceError('NOT_FOUND', 'The Pokémon to remove is not on your team.');
  }

  const existingAdd = await prisma.dreamTeamMember.findUnique({
    where: { auth0UserId_pokemonId: { auth0UserId, pokemonId: addPokemonId } },
  });
  if (existingAdd) {
    throw new ServiceError('DUPLICATE', `${existingAdd.pokemonName} is already on your team.`);
  }

  let pokemon;
  try {
    pokemon = await fetchPokemonDetail(addPokemonId);
  } catch (err) {
    throw new ServiceError('UPSTREAM_ERROR', 'PokeAPI is unavailable. Please try again later.');
  }
  if (!pokemon) {
    throw new ServiceError('NOT_FOUND', 'Pokémon not found.');
  }

  const [, member] = await prisma.$transaction([
    prisma.dreamTeamMember.delete({
      where: { auth0UserId_pokemonId: { auth0UserId, pokemonId: removePokemonId } },
    }),
    prisma.dreamTeamMember.create({
      data: { auth0UserId, pokemonId: pokemon.id, pokemonName: pokemon.name, spriteUrl: pokemon.spriteUrl },
    }),
  ]);

  return { message: `Swapped ${toRemove.pokemonName} for ${pokemon.name}!`, member };
}

module.exports = { getTeam, addToTeam, removeFromTeam, swapTeamMember };
