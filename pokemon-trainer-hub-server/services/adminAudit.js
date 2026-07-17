const prisma = require('./prisma');

// Records a meaningful Admin action — support status/priority changes,
// account deletion, etc. `details` is a small, non-sensitive plain object
// (never secrets or full record payloads) — stored as a JSON string since
// this datasource has no native JSON column type in use elsewhere in this
// schema. Read-only from every other part of the app: nothing ever
// updates or deletes an AdminAuditLog row.
async function logAdminAction(adminAuth0UserId, action, targetType, targetId, details) {
  await prisma.adminAuditLog.create({
    data: {
      adminAuth0UserId,
      action,
      targetType,
      targetId: targetId !== undefined && targetId !== null ? String(targetId) : null,
      detailsJson: details !== undefined ? JSON.stringify(details) : null,
    },
  });
}

// Real audit history for one record (e.g. a support request's drawer
// "History" timeline) — read-only, most recent first.
async function getAuditTrail(targetType, targetId) {
  return prisma.adminAuditLog.findMany({
    where: { targetType, targetId: String(targetId) },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = { logAdminAction, getAuditTrail };
