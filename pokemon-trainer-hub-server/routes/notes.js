const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');

const router = express.Router();

// GET /api/notes/:pokemonId — all of the current user's notes for this
// Pokémon, most recent first.
router.get('/:pokemonId', jwtCheck, async (req, res) => {
  const pokemonId = Number(req.params.pokemonId);
  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  const notes = await prisma.trainerNote.findMany({
    where: { auth0UserId: req.auth.payload.sub, pokemonId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(notes);
});

// POST /api/notes/:pokemonId  { text } — always creates a new note (this is
// a running log, not a single editable note).
router.post('/:pokemonId', jwtCheck, async (req, res) => {
  const pokemonId = Number(req.params.pokemonId);
  if (Number.isNaN(pokemonId)) {
    return res.status(400).json({ message: 'Pokémon id must be a number.' });
  }

  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ message: 'Note text is required.' });
  }

  const note = await prisma.trainerNote.create({
    data: { auth0UserId: req.auth.payload.sub, pokemonId, text },
  });

  res.status(201).json(note);
});

// DELETE /api/notes/:noteId — deletes one note by its own id. Scoped to
// auth0UserId so a user can't delete another trainer's note by guessing an id.
router.delete('/:noteId', jwtCheck, async (req, res) => {
  const noteId = Number(req.params.noteId);
  if (Number.isNaN(noteId)) {
    return res.status(400).json({ message: 'Note id must be a number.' });
  }

  await prisma.trainerNote.deleteMany({
    where: { id: noteId, auth0UserId: req.auth.payload.sub },
  });

  res.status(204).send();
});

module.exports = router;
