const Sentry = require('@sentry/node');
const prisma = require('./prisma');
const accountService = require('./accountService');
const { logAdminAction } = require('./adminAudit');

// AdminAuditLog.adminAuth0UserId isn't nullable — this is the fixed actor
// name for a purge, matching how every other admin action is attributed,
// just naming the automated process itself instead of a person.
const PURGE_ACTOR = 'system';

// The real conclusion of the 30-day soft-delete window (see
// accountService.softDeleteAccount) — finds every TrainerProfile whose
// purgeAt has passed and permanently deletes it via the same, unmodified
// accountService.deleteAccount() used by admin force-delete. Currently
// invoked manually by an authorized operator (POST /api/internal/purge-
// sweep, see routes/internal.js) rather than on a schedule — by decision,
// not a limitation; nothing here would need to change if a scheduler were
// wired up later. Processed sequentially (not Promise.all) — each deletion
// is its own DB transaction plus a real Auth0 API call, and this app's
// realistic scale doesn't need (or want) an unbounded burst against either.
//
// Eligibility is deliberately over-specified (both deletedAt and purgeAt
// checked, not just purgeAt) even though softDeleteAccount always sets them
// together and restoreAccount always clears them together — the query
// itself, not that invariant, is what an attacker or a future bug can't
// bypass. Nothing from the caller (whoever holds the shared secret has no
// way to name "which users" at all) ever influences which rows are
// selected; eligibility is computed entirely from real DB values and the
// server's own clock.
async function runPurgeSweep() {
  const candidates = await prisma.trainerProfile.findMany({
    where: { deletedAt: { not: null }, purgeAt: { not: null, lte: new Date() } },
    select: { auth0UserId: true },
  });

  let purged = 0;
  let skipped = 0;
  let failed = 0;

  for (const { auth0UserId } of candidates) {
    try {
      const { auth0DeleteFailed, deletedProfileCount } = await accountService.deleteAccount(auth0UserId);

      // deletedProfileCount === 0 means this row was already gone by the
      // time this candidate was processed (e.g. an admin's "Delete Forever"
      // or an overlapping sweep run got there first) — safely skipped, not
      // double-counted as a fresh purge. This is what keeps repeated runs
      // idempotent: a candidate that's already gone can never be purged
      // "again" or corrupt anything, it's just a no-op.
      if (deletedProfileCount > 0) {
        purged++;
        await logAdminAction(PURGE_ACTOR, 'trainer.purged', 'TrainerProfile', auth0UserId, { auth0DeleteFailed });
      } else {
        skipped++;
      }
    } catch (err) {
      // One candidate's failure must never abort the rest of the batch —
      // each candidate is an independent, self-contained deletion.
      failed++;
      console.error('Purge sweep: failed to delete one candidate account.');
      Sentry.captureException(err, { extra: { auth0UserId } });
    }
  }

  // Aggregate counts only — never a list of ids, emails, or names, since
  // this response can be seen by anything with the shared secret, not just
  // an admin's authenticated session.
  return { eligible: candidates.length, purged, skipped, failed };
}

module.exports = { runPurgeSweep };
