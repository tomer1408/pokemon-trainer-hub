const prisma = require('./prisma');
const accountService = require('./accountService');
const { logAdminAction } = require('./adminAudit');

// AdminAuditLog.adminAuth0UserId isn't nullable — this is the fixed actor
// name for a purge, matching how every other admin action is attributed,
// just naming the automated process itself instead of a person.
const PURGE_ACTOR = 'system';

// The automatic conclusion of the 30-day soft-delete window (see
// accountService.softDeleteAccount) — finds every TrainerProfile whose
// purgeAt has passed and permanently deletes it via the same, unmodified
// accountService.deleteAccount() used by admin force-delete. Processed
// sequentially (not Promise.all) — each deletion is its own DB transaction
// plus a real Auth0 API call, and this app's realistic scale doesn't need
// (or want) an unbounded burst against either.
async function runPurgeSweep() {
  const candidates = await prisma.trainerProfile.findMany({
    where: { purgeAt: { lte: new Date() } },
    select: { auth0UserId: true },
  });

  for (const { auth0UserId } of candidates) {
    const { auth0DeleteFailed } = await accountService.deleteAccount(auth0UserId);
    await logAdminAction(PURGE_ACTOR, 'trainer.purged', 'TrainerProfile', auth0UserId, { auth0DeleteFailed });
  }

  return { purged: candidates.length };
}

module.exports = { runPurgeSweep };
