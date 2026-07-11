const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');
const { MIN_AGE, calculateAge, calculateAgeRange } = require('../services/ageRange');

const router = express.Router();

// Server-authoritative — never trust a client-sent policyVersion for a
// compliance-relevant field.
const CURRENT_POLICY_VERSION = 'v1';

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
  acceptedPolicy: true,
  acceptedPolicyAt: true,
  policyVersion: true,
  marketingEmailsOptIn: true,
  createdAt: true,
};

function withAgeRange(profile) {
  return { ...profile, ageRange: calculateAgeRange(new Date(profile.dateOfBirth)) };
}

// Returns the current user's Trainer Profile, or 404 if not created yet
router.get('/', jwtCheck, async (req, res) => {
  const profile = await prisma.trainerProfile.findUnique({
    where: { auth0UserId: req.auth.payload.sub },
    select: PROFILE_SELECT,
  });

  if (!profile) {
    return res.status(404).json({ message: 'No profile found for this user.' });
  }

  res.json(withAgeRange(profile));
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
    acceptedPolicy,
    marketingEmailsOptIn,
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

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return res.status(400).json({ message: 'Please enter a valid date of birth.' });
  }
  const now = new Date();
  if (dob.getTime() > now.getTime()) {
    return res.status(400).json({ message: 'Date of birth cannot be in the future.' });
  }
  if (calculateAge(dob, now) < MIN_AGE) {
    return res
      .status(400)
      .json({ message: `You must be at least ${MIN_AGE} years old to create a Trainer Hub profile.` });
  }

  const existing = await prisma.trainerProfile.findUnique({
    where: { auth0UserId: req.auth.payload.sub },
    select: { acceptedPolicy: true, acceptedPolicyAt: true, policyVersion: true, marketingEmailsOptIn: true },
  });

  let consentData;
  if (!existing) {
    // Creating a new profile — real acceptance is required, and the
    // acceptance record (when/which version) is always set server-side.
    if (acceptedPolicy !== true) {
      return res
        .status(400)
        .json({ message: 'You must accept the Terms of Use and Privacy Policy to continue.' });
    }
    consentData = {
      acceptedPolicy: true,
      acceptedPolicyAt: now,
      policyVersion: CURRENT_POLICY_VERSION,
      marketingEmailsOptIn: typeof marketingEmailsOptIn === 'boolean' ? marketingEmailsOptIn : false,
    };
  } else {
    // Editing an existing profile never re-demands or overwrites the
    // acceptance record — only a genuinely new profile can set it.
    consentData = {
      acceptedPolicy: existing.acceptedPolicy,
      acceptedPolicyAt: existing.acceptedPolicyAt,
      policyVersion: existing.policyVersion,
      // A real, user-togglable preference — update it when sent, but don't
      // let an unrelated partial save silently reset it to false.
      marketingEmailsOptIn:
        typeof marketingEmailsOptIn === 'boolean' ? marketingEmailsOptIn : existing.marketingEmailsOptIn,
    };
  }

  const data = {
    trainerName,
    favoriteType,
    experienceLevel,
    firstName,
    lastName,
    dateOfBirth: dob,
    country,
    // Optional — the profile icon picker isn't required to complete onboarding.
    avatarPokemonId: Number.isInteger(avatarPokemonId) ? avatarPokemonId : null,
    // Optional — falls back to a generic "Your Dream Team" label in the UI.
    teamName: typeof teamName === 'string' && teamName.trim() ? teamName.trim() : null,
    ...consentData,
  };

  const profile = await prisma.trainerProfile.upsert({
    where: { auth0UserId: req.auth.payload.sub },
    update: data,
    create: { auth0UserId: req.auth.payload.sub, ...data },
    select: PROFILE_SELECT,
  });

  res.json(withAgeRange(profile));
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
    res.json(withAgeRange(profile));
  } catch (err) {
    res.status(404).json({ message: 'No profile found for this user.' });
  }
});

module.exports = router;
