const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');
const { fetchPokemonDetail } = require('../services/pokeapi');

const MAX_TEAM_SIZE = 5;
const router = express.Router();

// GET /api/team — the current user's Dream Team, enriched with stats/types
// (needed for Team Power and the type-distribution bar on the client).
router.get('/', jwtCheck, async (req, res) => {
  const members = await prisma.dreamTeamMember.findMany({
    where: { auth0UserId: req.auth.payload.sub },
    orderBy: { addedAt: 'asc' },
  });

  const enriched = await Promise.all(
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

  res.json(enriched);
});

// POST /api/team/:id — add a Pokémon to the team, blocking duplicates and a full team
router.post('/:id', jwtCheck, async (req, res) => {
  const auth0UserId = req.auth.payload.sub;
  const pokemonId = Number(req.params.id);

  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  const existing = await prisma.dreamTeamMember.findUnique({
    where: { auth0UserId_pokemonId: { auth0UserId, pokemonId } },
  });

  if (existing) {
    return res.status(409).json({
      reason: 'DUPLICATE',
      message: `${existing.pokemonName} is already in your team.`,
    });
  }

  const currentCount = await prisma.dreamTeamMember.count({ where: { auth0UserId } });
  if (currentCount >= MAX_TEAM_SIZE) {
    return res.status(409).json({
      reason: 'TEAM_FULL',
      message: 'Your Dream Team is already full (5/5).',
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

  const member = await prisma.dreamTeamMember.create({
    data: {
      auth0UserId,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
    },
  });

  res.status(201).json({ message: `${pokemon.name} joined your Dream Team!`, member });
});

// DELETE /api/team/:id — remove a Pokémon from the current user's team
router.delete('/:id', jwtCheck, async (req, res) => {
  const auth0UserId = req.auth.payload.sub;
  const pokemonId = Number(req.params.id);

  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  await prisma.dreamTeamMember.deleteMany({ where: { auth0UserId, pokemonId } });

  res.status(204).send();
});

module.exports = router;
