const express = require('express');
const jwtCheck = require('../middleware/auth');
const {
  fetchPokemonDetail,
  fetchPokemonFullDetail,
  getMasterList,
  getListByType,
  getTypeChart,
  getStrongestRankedList,
} = require('../services/pokeapi');

const PAGE_SIZE = 20;
const MAX_SURPRISE_COUNT = 5;
const router = express.Router();

// Fisher-Yates-based pick — same helper already used by GET /api/quiz/round
// (routes/quiz.js), duplicated here rather than shared: it's an 8-line pure
// function, not worth a new shared module for two callers.
function pickDistinctRandom(list, count) {
  const pool = [...list];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// GET /api/pokemon?search=&type=&sort=id|name|strongest&page=
// GET /api/pokemon?ids=25,1,4 — a small fixed set of exact ids (e.g. the
// avatar icon picker), returned unpaginated using the cheap detail shape.
// Deliberately bypasses search/type/sort/page entirely and, more importantly,
// bypasses fetchPokemonFullDetail — the icon picker only ever shows a sprite,
// so paying for species flavor text, type matchups, ability descriptions and
// move lookups (fetchPokemonFullDetail's job, ~10+ extra PokeAPI calls PER
// Pokémon) for every icon was pure waste that only slowed the picker down.
router.get('/', jwtCheck, async (req, res) => {
  const { search = '', type = '', sort = 'id', page = '1', ids = '' } = req.query;

  if (ids) {
    const idList = ids
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    let results;
    try {
      results = await Promise.all(idList.map((id) => fetchPokemonDetail(id)));
    } catch (err) {
      return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
    }

    results = results.filter(Boolean);
    return res.json({ results, page: 1, pageSize: results.length, total: results.length });
  }

  // Sorting by strongest needs a real detail fetch for every candidate (see
  // below) — on an unfiltered list that's up to the entire PokeAPI dataset
  // (1,300+ concurrent requests on a cold cache). Requiring a type keeps the
  // candidate set to one type's worth of Pokémon instead. The AI Trainer
  // Assistant's "strongest of type" lookup always sends a type already, so
  // it's unaffected — this only blocks an unfiltered direct call.
  if (sort === 'strongest' && !type) {
    return res.status(400).json({ message: 'Sorting by strongest requires a type filter.' });
  }

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
      // type is guaranteed present here (guarded above). Uses the shared,
      // cached full ranking for this type — keyed by type alone, not by
      // search term, so it's reused across different searches of the same
      // type — then re-applies the same name filter search already applied
      // to every other sort mode above, since that filtering happened
      // before this ranked list existed.
      const ranked = await getStrongestRankedList(type);
      candidates = search ? ranked.filter((p) => p.name.includes(search.toLowerCase())) : ranked;
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

// GET /api/pokemon/type-chart — real weak/resist/strong lists for all 18
// types at once. Registered before /:id so Express doesn't treat
// "type-chart" as a Pokémon id/name. Powers My Team's Battle Readiness and
// Matchup Analysis cards, which need team-wide type effectiveness — real
// PokeAPI damage relations, not an invented type table.
router.get('/type-chart', jwtCheck, async (req, res) => {
  try {
    const chart = await getTypeChart();
    res.json(chart);
  } catch (err) {
    res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
  }
});

// GET /api/pokemon/surprise?exclude=1,2,3&count=1&type=water — real random
// pick(s) for the "Surprise Me" feature. Registered before /:id so Express
// doesn't treat "surprise" as a Pokémon id/name. Never trusts anything
// beyond exclude/count/type from the client — the candidate pool always
// comes from real PokeAPI data (getListByType/getMasterList), same as
// every other route here; this only returns which real id(s) were picked,
// not full detail (the client already has getById/getByIds for that).
//
// Bias logic: if `type` is given, tries that type's real pool (minus
// excluded ids) first. Only falls back to the full, unfiltered master list
// (minus excluded ids) if that biased pool doesn't have enough real
// candidates left (or the type lookup failed) — `usedFallback` tells the
// client which of the two happened, so it can show the right reason text
// ("because you love X" vs "something new for you").
router.get('/surprise', jwtCheck, async (req, res) => {
  const excludeIds = new Set(
    String(req.query.exclude || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
  );
  const count = Math.min(MAX_SURPRISE_COUNT, Math.max(1, parseInt(req.query.count, 10) || 1));
  const type = req.query.type ? String(req.query.type).trim() : '';

  let biasedPool = null;
  if (type) {
    try {
      biasedPool = await getListByType(type);
    } catch (err) {
      return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
    }
  }

  let usedFallback = false;
  let pool = null;
  if (biasedPool) {
    const filtered = biasedPool.filter((p) => !excludeIds.has(p.id));
    if (filtered.length >= count) {
      pool = filtered;
    } else {
      usedFallback = true;
    }
  } else if (type) {
    usedFallback = true;
  }

  if (!pool) {
    let masterList;
    try {
      masterList = await getMasterList();
    } catch (err) {
      return res.status(502).json({ message: 'PokeAPI is unavailable. Please try again later.' });
    }
    pool = masterList.filter((p) => !excludeIds.has(p.id));
  }

  const picks = pickDistinctRandom(pool, count);
  res.json({ picks, usedFallback });
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
