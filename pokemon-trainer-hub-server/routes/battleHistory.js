const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');

const router = express.Router();

const VALID_RESULTS = new Set(['win', 'loss']);

// GET /api/battle-history — every completed match for the current user,
// most recent first. roundsJson/teamSnapshotJson are stored as plain JSON
// strings (one flat table, no normalized round table — this app's scale
// doesn't need relational round queries), parsed back into arrays here so
// the client never has to know they're stored serialized.
router.get('/', jwtCheck, async (req, res) => {
  const matches = await prisma.battleMatch.findMany({
    where: { auth0UserId: req.auth.payload.sub },
    orderBy: { createdAt: 'desc' },
  });

  res.json(
    matches.map((m) => ({
      id: m.id,
      opponentName: m.opponentName,
      difficulty: m.difficulty,
      rounds: m.rounds,
      roundsPlayed: m.roundsPlayed,
      opponentType: m.opponentType,
      luckFactor: m.luckFactor,
      result: m.result,
      yourWins: m.yourWins,
      oppWins: m.oppWins,
      roundDetails: JSON.parse(m.roundsJson),
      teamSnapshot: JSON.parse(m.teamSnapshotJson),
      createdAt: m.createdAt,
    })),
  );
});

// POST /api/battle-history — records one completed match. Called once by
// the client when a Battle match is decided (see pages/battle/battle.ts);
// never blocks the match-over screen if it fails.
router.post('/', jwtCheck, async (req, res) => {
  const b = req.body;
  const opponentName = typeof b.opponentName === 'string' ? b.opponentName.trim() : '';
  const difficulty = typeof b.difficulty === 'string' ? b.difficulty : '';
  const opponentType = typeof b.opponentType === 'string' ? b.opponentType : '';
  const luckFactor = typeof b.luckFactor === 'string' ? b.luckFactor : '';
  const rounds = Number(b.rounds);
  const roundsPlayed = Number(b.roundsPlayed);
  const yourWins = Number(b.yourWins);
  const oppWins = Number(b.oppWins);
  const result = typeof b.result === 'string' ? b.result : '';
  const roundDetails = Array.isArray(b.roundDetails) ? b.roundDetails : null;
  const teamSnapshot = Array.isArray(b.teamSnapshot) ? b.teamSnapshot : null;

  if (
    !opponentName ||
    !difficulty ||
    !opponentType ||
    !luckFactor ||
    !VALID_RESULTS.has(result) ||
    !Number.isFinite(rounds) ||
    !Number.isFinite(roundsPlayed) ||
    !Number.isFinite(yourWins) ||
    !Number.isFinite(oppWins) ||
    !roundDetails ||
    !teamSnapshot
  ) {
    return res.status(400).json({ message: 'A complete match record is required.' });
  }

  const match = await prisma.battleMatch.create({
    data: {
      auth0UserId: req.auth.payload.sub,
      opponentName,
      difficulty,
      rounds,
      roundsPlayed,
      opponentType,
      luckFactor,
      result,
      yourWins,
      oppWins,
      roundsJson: JSON.stringify(roundDetails),
      teamSnapshotJson: JSON.stringify(teamSnapshot),
    },
  });

  res.status(201).json({ id: match.id, createdAt: match.createdAt });
});

module.exports = router;
