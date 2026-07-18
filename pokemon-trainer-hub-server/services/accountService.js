const prisma = require('./prisma');
const { deleteAuth0User } = require('./auth0Management');
const ServiceError = require('./serviceError');

// No native Prisma enum on this datasource (SQL Server) — validated String
// with a server-side allowlist, same treatment as favoriteType/
// experienceLevel elsewhere in this schema. Every real caller sets this
// server-side (never from client input) — routes/profile.js's DELETE always
// passes 'self', routes/adminTrainers.js's DELETE always passes 'admin' —
// this allowlist is defensive insurance, not a response to any untrusted
// input that exists today.
const VALID_DELETION_TYPES = ['self', 'admin'];
const PURGE_WINDOW_DAYS = 30;

// Deletes every row this trainer owns (one atomic transaction), then deletes
// their real Auth0 identity. Order matters: DB rows are deleted FIRST. If the
// Auth0 step then fails, the trainer's data is already guaranteed gone — at
// worst they can still log back in to a completely empty account and
// re-onboard, which is harmless. The reverse order would risk a trainer whose
// Auth0 identity is gone (so they can never log in again) while their data
// still sits in the DB with no admin UI to reach it (see
// scripts/wipe-user-data.js's own comments on that).
//
// Every deleteMany here — including trainerProfile — is intentionally NOT
// `.delete()`: a trainer who created an Auth0 account but never finished
// onboarding has no TrainerProfile row yet, and `.delete()` would throw
// (Prisma P2025) and abort the whole transaction array. deleteMany is
// idempotent like every other table here. AvatarIcon is untouched — it's
// shared reference data (see schema.prisma), not user data.
async function deleteAccount(auth0UserId) {
  await prisma.$transaction([
    prisma.trainerNote.deleteMany({ where: { auth0UserId } }),
    prisma.favorite.deleteMany({ where: { auth0UserId } }),
    prisma.supportRequest.deleteMany({ where: { auth0UserId } }),
    prisma.battleMatch.deleteMany({ where: { auth0UserId } }),
    prisma.dreamTeamMember.deleteMany({ where: { auth0UserId } }),
    prisma.trainerProfile.deleteMany({ where: { auth0UserId } }),
  ]);

  try {
    await deleteAuth0User(auth0UserId);
    return { auth0DeleteFailed: false };
  } catch (err) {
    // The DB half of this already committed successfully — that's the part
    // that must never silently fail. This is logged, not rethrown, and
    // surfaced to the client as an honest warning (see routes/profile.js).
    console.error(`Auth0 user deletion failed for a trainer whose DB data was already deleted: ${err.message}`);
    return { auth0DeleteFailed: true };
  }
}

// Marks a trainer account for deletion without touching a single row of
// their real data — a single-row update on TrainerProfile, nothing else.
// The other 5 user tables (DreamTeamMember, Favorite, TrainerNote,
// SupportRequest, BattleMatch) are deliberately never touched here: a
// soft-deleted trainer can never obtain a working session again (see
// routes/profile.js's GET / gate), so those rows are simply unreachable
// until either restoreAccount() or the 30-day purge sweep calls the real
// deleteAccount() above. Auth0 is not touched either — deferred until the
// purge, since Auth0 has no undelete and restore would otherwise be
// meaningless.
async function softDeleteAccount(auth0UserId, { deletedBy, deletionType }) {
  if (!VALID_DELETION_TYPES.includes(deletionType)) {
    throw new ServiceError('INVALID_DELETION_TYPE', `deletionType must be one of: ${VALID_DELETION_TYPES.join(', ')}.`);
  }

  const deletedAt = new Date();
  const purgeAt = new Date(deletedAt);
  purgeAt.setDate(purgeAt.getDate() + PURGE_WINDOW_DAYS);

  await prisma.trainerProfile.update({
    where: { auth0UserId },
    data: { deletedAt, purgeAt, deletedBy, deletionType },
  });
}

// Reverses softDeleteAccount() — clears all 4 fields in one update. There is
// nothing else to restore: since the other 5 tables were never touched at
// soft-delete time, the trainer's full account is intact the moment this
// resolves. Only ever called from an admin-initiated restore action (see
// routes/adminTrainers.js) — there is no self-service restore path.
async function restoreAccount(auth0UserId) {
  await prisma.trainerProfile.update({
    where: { auth0UserId },
    data: { deletedAt: null, purgeAt: null, deletedBy: null, deletionType: null },
  });
}

module.exports = { deleteAccount, softDeleteAccount, restoreAccount };
