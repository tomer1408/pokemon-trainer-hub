const express = require('express');
const jwtCheck = require('../middleware/auth');
const { getMasterList, fetchPokemonDetail } = require('../services/pokeapi');

const router = express.Router();

// Fisher-Yates, without mutating the caller's array.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistinctRandom(list, count) {
  const pool = [...list];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// GET /api/quiz/round — a fresh "Who's That Pokémon?" round: 1 real target
// Pokémon (the client silhouettes its real sprite) plus 3 real distractor
// options, all sourced from the same PokeAPI-backed data every other screen
// uses. The model/server never invents a name — every option here resolves
// to an actual Pokémon.
router.get('/round', jwtCheck, async (req, res) => {
  const list = await getMasterList();
  const picks = pickDistinctRandom(list, 4);

  const details = await Promise.all(picks.map((p) => fetchPokemonDetail(p.id).catch(() => null)));
  const valid = details.filter(Boolean);
  if (valid.length < 4) {
    return res.status(502).json({ message: 'Could not load a quiz round right now. Please try again.' });
  }

  const [target, ...distractors] = valid;
  const options = shuffle([target, ...distractors]).map((p) => ({
    id: p.id,
    name: p.name,
    types: p.types,
  }));

  res.json({
    target: {
      id: target.id,
      name: target.name,
      types: target.types,
      spriteUrl: target.spriteUrl,
      baseExperience: target.baseExperience,
    },
    options,
  });
});

module.exports = router;
