const express = require('express');
const jwtCheck = require('../middleware/auth');
const favoritesService = require('../services/favoritesService');
const ServiceError = require('../services/serviceError');

const router = express.Router();

const STATUS_BY_CODE = {
  DUPLICATE: 409,
  NOT_FOUND: 404,
  UPSTREAM_ERROR: 502,
};

function respondToServiceError(err, res) {
  const status = STATUS_BY_CODE[err.code] || 500;
  const body = status === 409 ? { reason: err.code, message: err.message } : { message: err.message };
  res.status(status).json(body);
}

// GET /api/favorites
router.get('/', jwtCheck, async (req, res) => {
  const favorites = await favoritesService.getFavorites(req.auth.payload.sub);
  res.json(favorites);
});

// POST /api/favorites/:id
router.post('/:id', jwtCheck, async (req, res) => {
  const pokemonId = Number(req.params.id);
  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  try {
    const result = await favoritesService.addFavorite(req.auth.payload.sub, pokemonId);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ServiceError) return respondToServiceError(err, res);
    throw err;
  }
});

// DELETE /api/favorites/:id
router.delete('/:id', jwtCheck, async (req, res) => {
  const pokemonId = Number(req.params.id);
  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  await favoritesService.removeFavorite(req.auth.payload.sub, pokemonId);
  res.status(204).send();
});

module.exports = router;
