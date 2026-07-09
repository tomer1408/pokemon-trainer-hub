const express = require('express');
const jwtCheck = require('../middleware/auth');
const { fetchPokemonDetail, fetchPokemonFullDetail, getMasterList, getListByType } = require('../services/pokeapi');

const PAGE_SIZE = 20;
const router = express.Router();

// GET /api/pokemon?search=&type=&sort=id|name|strongest&page=
router.get('/', jwtCheck, async (req, res) => {
  const { search = '', type = '', sort = 'id', page = '1' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  let candidates;
  try {
    candidates = type ? await getListByType(type) : await getMasterList();
  } catch (err) {
    return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
  }

  if (candidates === null) {
    return res.status(400).json({ message: `Unknown type "${type}".` });
  }

  if (search) {
    const term = search.toLowerCase();
    candidates = candidates.filter((p) => p.name.includes(term));
  }

  try {
    if (sort === 'name') {
      candidates = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'strongest') {
      // Needs full details for every candidate to know its total power — cached,
      // so this is only slow the very first time an unfiltered list is sorted this way.
      const detailed = await Promise.all(candidates.map((c) => fetchPokemonDetail(c.id)));
      candidates = detailed
        .filter(Boolean)
        .sort((a, b) => b.baseExperience - a.baseExperience)
        .map((p) => ({ id: p.id, name: p.name }));
    } else {
      candidates = [...candidates].sort((a, b) => a.id - b.id);
    }
  } catch (err) {
    return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
  }

  const total = candidates.length;
  const start = (pageNum - 1) * PAGE_SIZE;
  const pageSlice = candidates.slice(start, start + PAGE_SIZE);

  let results;
  try {
    results = await Promise.all(pageSlice.map((c) => fetchPokemonDetail(c.id)));
  } catch (err) {
    return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
  }

  res.json({ results: results.filter(Boolean), page: pageNum, pageSize: PAGE_SIZE, total });
});

// GET /api/pokemon/:id — id or name, both work since PokeAPI accepts either.
// Returns the fuller shape (flavor text, weaknesses/resistances) since this
// is what backs the Pokémon Detail Modal, not the list grid.
router.get('/:id', jwtCheck, async (req, res) => {
  let pokemon;
  try {
    pokemon = await fetchPokemonFullDetail(req.params.id);
  } catch (err) {
    return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
  }

  if (!pokemon) {
    return res.status(404).json({ message: 'Pokémon not found.' });
  }

  res.json(pokemon);
});

module.exports = router;
