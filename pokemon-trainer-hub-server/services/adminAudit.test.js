const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/adminAudit', () => {
  let adminAudit;
  let prisma;

  before(() => {
    prisma = {
      adminAuditLog: {
        create: mock.fn(async ({ data }) => ({ id: 1, ...data })),
        findMany: mock.fn(async () => []),
      },
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });
    adminAudit = require('./adminAudit');
  });

  beforeEach(() => {
    prisma.adminAuditLog.create.mock.resetCalls();
    prisma.adminAuditLog.findMany.mock.resetCalls();
  });

  test('logAdminAction stores a real row with a JSON-stringified details object', async () => {
    await adminAudit.logAdminAction('auth0|admin', 'support.status_changed', 'SupportRequest', 5, {
      from: 'open',
      to: 'resolved',
    });

    assert.equal(prisma.adminAuditLog.create.mock.calls.length, 1);
    const data = prisma.adminAuditLog.create.mock.calls[0].arguments[0].data;
    assert.equal(data.adminAuth0UserId, 'auth0|admin');
    assert.equal(data.action, 'support.status_changed');
    assert.equal(data.targetType, 'SupportRequest');
    assert.equal(data.targetId, '5');
    assert.deepEqual(JSON.parse(data.detailsJson), { from: 'open', to: 'resolved' });
  });

  test('logAdminAction stores null targetId/detailsJson when omitted', async () => {
    await adminAudit.logAdminAction('auth0|admin', 'trainer.deleted', 'TrainerProfile', undefined, undefined);

    const data = prisma.adminAuditLog.create.mock.calls[0].arguments[0].data;
    assert.equal(data.targetId, null);
    assert.equal(data.detailsJson, null);
  });

  test('getAuditTrail queries by targetType/targetId, most recent first', async () => {
    await adminAudit.getAuditTrail('SupportRequest', 5);

    assert.equal(prisma.adminAuditLog.findMany.mock.calls.length, 1);
    const args = prisma.adminAuditLog.findMany.mock.calls[0].arguments[0];
    assert.deepEqual(args.where, { targetType: 'SupportRequest', targetId: '5' });
    assert.deepEqual(args.orderBy, { createdAt: 'desc' });
  });
});
