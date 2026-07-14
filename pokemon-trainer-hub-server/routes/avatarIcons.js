const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');

const router = express.Router();

// GET /api/avatar-icons — the full curated set, straight from our own DB
// (seeded once via scripts/seed-avatar-icons.js). No PokeAPI call at
// request time at all, unlike the old getByIds()-per-page-load approach.
router.get('/', jwtCheck, async (req, res) => {
  const icons = await prisma.avatarIcon.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });
  res.json(icons);
});

module.exports = router;
