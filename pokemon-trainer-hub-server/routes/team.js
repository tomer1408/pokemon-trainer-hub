const express = require('express');
const jwtCheck = require('../middleware/auth');
const teamService = require('../services/teamService');
const ServiceError = require('../services/serviceError');

const router = express.Router();

const STATUS_BY_CODE = {
  DUPLICATE: 409,
  TEAM_FULL: 409,
  NOT_FOUND: 404,
  UPSTREAM_ERROR: 502,
  INVALID_ORDER: 400,
};

function respondToServiceError(err, res) {
  const status = STATUS_BY_CODE[err.code] || 500;
  const body = status === 409 ? { reason: err.code, message: err.message } : { message: err.message };
  res.status(status).json(body);
}

// GET /api/team
router.get('/', jwtCheck, async (req, res) => {
  const team = await teamService.getTeam(req.auth.payload.sub);
  res.json(team);
});

// POST /api/team/swap  { removePokemonId, addPokemonId }
// Must be declared before POST /:id — otherwise Express would match "swap"
// as the :id param and this route would never be reached.
router.post('/swap', jwtCheck, async (req, res) => {
  const { removePokemonId, addPokemonId } = req.body;
  if (!Number.isInteger(removePokemonId) || !Number.isInteger(addPokemonId)) {
    return res.status(400).json({ message: 'removePokemonId and addPokemonId must both be numbers.' });
  }

  try {
    const result = await teamService.swapTeamMember(req.auth.payload.sub, removePokemonId, addPokemonId);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ServiceError) return respondToServiceError(err, res);
    throw err;
  }
});

// PATCH /api/team/reorder  { pokemonIds: number[] }
// Must be declared before POST /:id — same reason as /swap above. The user
// is always identified from the JWT (req.auth.payload.sub) — the client
// never sends and the server never trusts an auth0UserId from the body.
router.patch('/reorder', jwtCheck, async (req, res) => {
  const { pokemonIds } = req.body;
  if (!Array.isArray(pokemonIds) || pokemonIds.length === 0 || !pokemonIds.every((id) => Number.isInteger(id))) {
    return res.status(400).json({ message: 'pokemonIds must be a non-empty array of Pokémon ids.' });
  }

  try {
    await teamService.reorderTeam(req.auth.payload.sub, pokemonIds);
    res.status(200).json({ message: 'Team order saved.' });
  } catch (err) {
    if (err instanceof ServiceError) return respondToServiceError(err, res);
    throw err;
  }
});

// POST /api/team/:id
router.post('/:id', jwtCheck, async (req, res) => {
  const pokemonId = Number(req.params.id);
  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  try {
    const result = await teamService.addToTeam(req.auth.payload.sub, pokemonId);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ServiceError) return respondToServiceError(err, res);
    throw err;
  }
});

// DELETE /api/team/:id
router.delete('/:id', jwtCheck, async (req, res) => {
  const pokemonId = Number(req.params.id);
  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  await teamService.removeFromTeam(req.auth.payload.sub, pokemonId);
  res.status(204).send();
});

module.exports = router;
