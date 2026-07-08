const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');
const { fetchPokemonDetail } = require('../services/pokeapi');

const router = express.Router();

// GET /api/favorites — the current user's favorites, enriched with stats/types
router.get('/', jwtCheck, async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { auth0UserId: req.auth.payload.sub },
    orderBy: { addedAt: 'asc' },
  });

  const enriched = await Promise.all(
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

  res.json(enriched);
});

// POST /api/favorites/:id — add a Pokémon to favorites (no size limit, unlike the Dream Team)
router.post('/:id', jwtCheck, async (req, res) => {
  const auth0UserId = req.auth.payload.sub;
  const pokemonId = Number(req.params.id);

  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  const existing = await prisma.favorite.findUnique({
    where: { auth0UserId_pokemonId: { auth0UserId, pokemonId } },
  });

  if (existing) {
    return res.status(409).json({
      reason: 'DUPLICATE',
      message: `${existing.pokemonName} is already in your favorites.`,
    });
  }

  let pokemon;
  try {
    pokemon = await fetchPokemonDetail(pokemonId);
  } catch (err) {
    return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
  }

  if (!pokemon) {
    return res.status(404).json({ message: 'Pokémon not found.' });
  }

  const favorite = await prisma.favorite.create({
    data: {
      auth0UserId,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
    },
  });

  res.status(201).json({ message: `${pokemon.name} added to your favorites!`, favorite });
});

// DELETE /api/favorites/:id — remove a Pokémon from the current user's favorites
router.delete('/:id', jwtCheck, async (req, res) => {
  const auth0UserId = req.auth.payload.sub;
  const pokemonId = Number(req.params.id);

  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  await prisma.favorite.deleteMany({ where: { auth0UserId, pokemonId } });

  res.status(204).send();
});

module.exports = router;
