const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');
const { MIN_AGE, calculateAge, calculateAgeRange } = require('../services/ageRange');
const { validateTeamNameValue } = require('../services/teamNameFallback');
const accountService = require('../services/accountService');
const { getAuth0User } = require('../services/auth0Management');

const router = express.Router();

// Server-authoritative — never trust a client-sent policyVersion for a
// compliance-relevant field.
const CURRENT_POLICY_VERSION = 'v1';

// The restoration-request SupportRequest's topic is always derived from the
// caller's own real deletionType — never accepted from the client — so a
// self-deleted trainer's genuine "please restore me" request is always
// distinguishable, in the Admin's Support Requests queue, from an
// admin-deleted trainer's "you blocked me, here's my message" contact.
const RESTORATION_TOPIC_BY_DELETION_TYPE = {
  self: 'account_restoration',
  admin: 'account_blocked_contact',
};

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
  whosThatBestStreak: true,
  createdAt: true,
};

function withAgeRange(profile) {
  return { ...profile, ageRange: calculateAgeRange(new Date(profile.dateOfBirth)) };
}

// Returns the current user's Trainer Profile, or 404 if not created yet.
// Also the single account-status gate every login flow depends on
// (pages/callback/callback.ts, shared/onboarding-guard.ts on the client):
// a soft-deleted trainer (deletedAt set — see accountService.softDeleteAccount)
// gets 403 ACCOUNT_DELETED instead of their profile, for the full 30-day
// window, regardless of who deleted them. deletionType tells the client
// which of the two restoration-request screens to show.
router.get('/', jwtCheck, async (req, res) => {
  const profile = await prisma.trainerProfile.findUnique({
    where: { auth0UserId: req.auth.payload.sub },
    select: { ...PROFILE_SELECT, deletedAt: true, deletionType: true },
  });

  if (!profile) {
    return res.status(404).json({ message: 'No profile found for this user.' });
  }

  if (profile.deletedAt) {
    return res.status(403).json({
      code: 'ACCOUNT_DELETED',
      deletionType: profile.deletionType,
      message: 'This account has been deleted.',
    });
  }

  const { deletedAt, deletionType, ...safeProfile } = profile;
  res.json(withAgeRange(safeProfile));
});

// Creates or updates the current user's Trainer Profile
router.post('/', jwtCheck, async (req, res) => {
  const {
    trainerName,
    favoriteType,
    firstName,
    lastName,
    dateOfBirth,
    country,
    avatarPokemonId,
    teamName,
    acceptedPolicy,
    marketingEmailsOptIn,
  } = req.body;

  if (!trainerName || !favoriteType || !firstName || !lastName || !dateOfBirth || !country) {
    return res.status(400).json({
      message: 'trainerName, favoriteType, firstName, lastName, dateOfBirth and country are all required.',
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
    select: {
      acceptedPolicy: true,
      acceptedPolicyAt: true,
      policyVersion: true,
      marketingEmailsOptIn: true,
      experienceLevel: true,
      deletedAt: true,
      deletionType: true,
    },
  });

  // Defensive guard: without this, a stale-tokened soft-deleted trainer
  // could resurrect their own row via a generic profile save while it's
  // still flagged deletedAt — a real correctness bug, not just a UX gap.
  // GET / above is the primary gate every login flow already respects;
  // this closes the same hole on the one other route that can touch this
  // row while deletedAt is set.
  if (existing?.deletedAt) {
    return res.status(403).json({
      code: 'ACCOUNT_DELETED',
      deletionType: existing.deletionType,
      message: 'This account has been deleted.',
    });
  }

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
    // Not client-editable — every trainer starts at 'Beginner' and keeps
    // whatever's already on file otherwise. A future levels-up feature
    // should change this via its own dedicated endpoint (like
    // /whos-that-streak below), not by trusting a client-sent value here.
    experienceLevel: existing ? existing.experienceLevel : 'Beginner',
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

// Updates ONLY the team name — lighter than the full POST / upsert above,
// so callers that already have a name in hand (e.g. the AI Team Name
// Generator on My Team, which doesn't hold a full profile draft) don't need
// to fetch and resend the entire profile just to change one field. The
// value is validated here regardless of where it came from — an AI
// suggestion is not trusted just because it came from the assistant.
router.patch('/team-name', jwtCheck, async (req, res) => {
  const validation = validateTeamNameValue(req.body.name);
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  try {
    const profile = await prisma.trainerProfile.update({
      where: { auth0UserId: req.auth.payload.sub },
      data: { teamName: validation.name },
      select: PROFILE_SELECT,
    });
    res.json(withAgeRange(profile));
  } catch (err) {
    res.status(404).json({ message: 'No profile found for this user.' });
  }
});

// Records a new "Who's That Pokémon?" streak — real, server-side, tied to
// the JWT-identified user (not browser localStorage), same reasoning as
// /starter-quiz above. Only ever moves the stored best up: the client sends
// whatever streak it just reached, and the server keeps the higher of that
// and what's already on file, so a stale/out-of-order request can never
// regress a trainer's real best.
router.patch('/whos-that-streak', jwtCheck, async (req, res) => {
  const streak = req.body.streak;
  if (!Number.isInteger(streak) || streak < 0) {
    return res.status(400).json({ message: 'streak must be a non-negative integer.' });
  }

  try {
    const existing = await prisma.trainerProfile.findUnique({
      where: { auth0UserId: req.auth.payload.sub },
      select: { whosThatBestStreak: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'No profile found for this user.' });
    }

    const profile = await prisma.trainerProfile.update({
      where: { auth0UserId: req.auth.payload.sub },
      data: { whosThatBestStreak: Math.max(existing.whosThatBestStreak, streak) },
      select: PROFILE_SELECT,
    });
    res.json(withAgeRange(profile));
  } catch (err) {
    res.status(404).json({ message: 'No profile found for this user.' });
  }
});

// Soft-deletes the account — no data is actually touched, and Auth0 isn't
// touched at all (see accountService.softDeleteAccount). auth0UserId always
// comes from the verified JWT, never the body (see middleware/auth.js).
// The trainer is blocked from the app for 30 days (GET / above); if they
// log back in during that window they can submit a restoration request
// (POST /restoration-request, added in a later phase) — only an admin can
// actually restore the account. If untouched for 30 days, the account and
// all its data are permanently purged by the automatic sweep.
router.delete('/', jwtCheck, async (req, res) => {
  await accountService.softDeleteAccount(req.auth.payload.sub, {
    deletedBy: req.auth.payload.sub,
    deletionType: 'self',
  });
  res.status(200).json({
    message:
      'Your account has been deleted. You have 30 days to request restoration by logging back in — after that, it is permanently removed.',
  });
});

// Submits a restoration request while soft-deleted — the entry point a
// soft-deleted trainer reaches by logging back in during their 30-day
// window (see pages/restore-account/ on the client). Reuses the existing
// SupportRequest table/Admin Support Requests page unmodified rather than
// building a new model/admin UI: `topic` is always derived server-side from
// the caller's own real `deletionType` (RESTORATION_TOPIC_BY_DELETION_TYPE
// above), never accepted from the client. Only an admin can act on this —
// submitting it never restores anything by itself (see
// routes/adminTrainers.js's PATCH /:id/restore, added in a later phase).
router.post('/restoration-request', jwtCheck, async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    return res.status(400).json({ message: 'A message is required.' });
  }

  const profile = await prisma.trainerProfile.findUnique({
    where: { auth0UserId: req.auth.payload.sub },
    select: { trainerName: true, deletedAt: true, deletionType: true },
  });

  // Never trust a client claim of "I'm deleted" — only a genuinely
  // soft-deleted account (deletedAt set) can submit this. An active
  // trainer, or one with no profile at all, gets a plain 400/404.
  if (!profile) {
    return res.status(404).json({ message: 'No profile found for this user.' });
  }
  if (!profile.deletedAt) {
    return res.status(400).json({ message: 'This account is not currently deleted.' });
  }

  let email;
  try {
    email = (await getAuth0User(req.auth.payload.sub)).email;
  } catch (err) {
    return res.status(502).json({ message: 'Could not reach Auth0 to submit your request. Please try again.' });
  }

  const request = await prisma.supportRequest.create({
    data: {
      auth0UserId: req.auth.payload.sub,
      name: profile.trainerName,
      email,
      topic: RESTORATION_TOPIC_BY_DELETION_TYPE[profile.deletionType],
      message,
    },
  });

  res.status(201).json({ id: request.id, createdAt: request.createdAt });
});

module.exports = router;
