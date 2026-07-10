const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');

const router = express.Router();

// Only safe, user-facing fields are ever sent to the client — never the
// internal row id or the Auth0 subject/user id.
const PROFILE_SELECT = {
  trainerName: true,
  favoriteType: true,
  experienceLevel: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  country: true,
  avatarPokemonId: true,
  teamName: true,
  hasCompletedStarterQuiz: true,
  createdAt: true,
};

// Returns the current user's Trainer Profile, or 404 if not created yet
router.get('/', jwtCheck, async (req, res) => {
  const profile = await prisma.trainerProfile.findUnique({
    where: { auth0UserId: req.auth.payload.sub },
    select: PROFILE_SELECT,
  });

  if (!profile) {
    return res.status(404).json({ message: 'No profile found for this user.' });
  }

  res.json(profile);
});

// Creates or updates the current user's Trainer Profile
router.post('/', jwtCheck, async (req, res) => {
  const {
    trainerName,
    favoriteType,
    experienceLevel,
    firstName,
    lastName,
    dateOfBirth,
    country,
    avatarPokemonId,
    teamName,
  } = req.body;

  if (
    !trainerName ||
    !favoriteType ||
    !experienceLevel ||
    !firstName ||
    !lastName ||
    !dateOfBirth ||
    !country
  ) {
    return res.status(400).json({
      message:
        'trainerName, favoriteType, experienceLevel, firstName, lastName, dateOfBirth and country are all required.',
    });
  }

  const data = {
    trainerName,
    favoriteType,
    experienceLevel,
    firstName,
    lastName,
    dateOfBirth: new Date(dateOfBirth),
    country,
    // Optional — the profile icon picker isn't required to complete onboarding.
    avatarPokemonId: Number.isInteger(avatarPokemonId) ? avatarPokemonId : null,
    // Optional — falls back to a generic "Your Dream Team" label in the UI.
    teamName: typeof teamName === 'string' && teamName.trim() ? teamName.trim() : null,
  };

  const profile = await prisma.trainerProfile.upsert({
    where: { auth0UserId: req.auth.payload.sub },
    update: data,
    create: { auth0UserId: req.auth.payload.sub, ...data },
    select: PROFILE_SELECT,
  });

  res.json(profile);
});

// Marks the current user's Starter Quiz as completed — real, server-side,
// tied to the JWT-identified user (not client-side storage). 404s if the
// trainer somehow has no profile row yet, since onboarding always creates
// one before Home (and this endpoint) is reachable.
router.patch('/starter-quiz', jwtCheck, async (req, res) => {
  try {
    const profile = await prisma.trainerProfile.update({
      where: { auth0UserId: req.auth.payload.sub },
      data: { hasCompletedStarterQuiz: true },
      select: PROFILE_SELECT,
    });
    res.json(profile);
  } catch (err) {
    res.status(404).json({ message: 'No profile found for this user.' });
  }
});

module.exports = router;
