const prisma = require('./prisma');
const { fetchPokemonDetail } = require('./pokeapi');
const ServiceError = require('./serviceError');

// The current user's favorites, enriched with stats/types (no size limit, unlike the Dream Team).
async function getFavorites(auth0UserId) {
  const favorites = await prisma.favorite.findMany({
    where: { auth0UserId },
    orderBy: { addedAt: 'asc' },
  });

  return Promise.all(
    favorites.map(async (favorite) => {
      let detail = null;
      try {
        detail = await fetchPokemonDetail(favorite.pokemonId);
      } catch (err) {
        // PokeAPI being briefly down shouldn't break the whole favorites screen —
        // the entry still shows up, just without stats/types for now.
      }

      return {
        pokemonId: favorite.pokemonId,
        pokemonName: favorite.pokemonName,
        spriteUrl: favorite.spriteUrl,
        addedAt: favorite.addedAt,
        stats: detail?.stats ?? [],
        types: detail?.types ?? [],
        baseExperience: detail?.baseExperience ?? 0,
      };
    })
  );
}

// Adds a Pokémon to favorites. Throws ServiceError('DUPLICATE' | 'NOT_FOUND' | 'UPSTREAM_ERROR').
async function addFavorite(auth0UserId, pokemonId) {
  // The duplicate-check (DB) and the Pokémon lookup (PokeAPI, usually cached)
  // don't depend on each other's result, so they run concurrently instead of
  // one-after-another — on production (Azure SQL over a real network, not
  // localhost) each extra sequential round trip is real added latency.
  const [existing, pokemonResult] = await Promise.all([
    prisma.favorite.findUnique({ where: { auth0UserId_pokemonId: { auth0UserId, pokemonId } } }),
    fetchPokemonDetail(pokemonId).then(
      (value) => ({ ok: true, value }),
      (err) => ({ ok: false, err }),
    ),
  ]);

  if (existing) {
    throw new ServiceError('DUPLICATE', `${existing.pokemonName} is already in your favorites.`);
  }

  if (!pokemonResult.ok) {
    throw new ServiceError('UPSTREAM_ERROR', 'PokeAPI is unavailable. Please try again later.');
  }

  const pokemon = pokemonResult.value;
  if (!pokemon) {
    throw new ServiceError('NOT_FOUND', 'Pokémon not found.');
  }

  const favorite = await prisma.favorite.create({
    data: {
      auth0UserId,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
    },
  });

  return { message: `${pokemon.name} added to your favorites!`, favorite };
}

// Removing something that was never there is not an error (idempotent).
async function removeFavorite(auth0UserId, pokemonId) {
  await prisma.favorite.deleteMany({ where: { auth0UserId, pokemonId } });
}

module.exports = { getFavorites, addFavorite, removeFavorite };
