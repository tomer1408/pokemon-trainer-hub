const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/purgeSweepService', () => {
  let service;
  let prisma;
  let accountService;
  let adminAudit;

  before(() => {
    prisma = {
      trainerProfile: { findMany: mock.fn(async () => []) },
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    accountService = { deleteAccount: mock.fn(async () => ({ auth0DeleteFailed: false })) };
    mock.module(path.resolve(__dirname, './accountService.js'), { exports: accountService });

    adminAudit = { logAdminAction: mock.fn(async () => {}) };
    mock.module(path.resolve(__dirname, './adminAudit.js'), { exports: adminAudit });

    service = require('./purgeSweepService');
  });

  beforeEach(() => {
    prisma.trainerProfile.findMany.mock.resetCalls();
    prisma.trainerProfile.findMany.mock.mockImplementation(async () => []);
    accountService.deleteAccount.mock.resetCalls();
    accountService.deleteAccount.mock.mockImplementation(async () => ({ auth0DeleteFailed: false }));
    adminAudit.logAdminAction.mock.resetCalls();
  });

  test('finds candidates with a real purgeAt <= now filter', async () => {
    await service.runPurgeSweep();

    const where = prisma.trainerProfile.findMany.mock.calls[0].arguments[0].where;
    assert.ok(where.purgeAt.lte instanceof Date);
    const secondsAgo = (Date.now() - where.purgeAt.lte.getTime()) / 1000;
    assert.ok(secondsAgo >= 0 && secondsAgo < 5);
  });

  test('returns { purged: 0 } and touches nothing when there are no candidates', async () => {
    const result = await service.runPurgeSweep();

    assert.deepEqual(result, { purged: 0 });
    assert.equal(accountService.deleteAccount.mock.calls.length, 0);
    assert.equal(adminAudit.logAdminAction.mock.calls.length, 0);
  });

  test('calls the real, unmodified deleteAccount for every real candidate', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [
      { auth0UserId: 'auth0|a' },
      { auth0UserId: 'auth0|b' },
    ]);

    const result = await service.runPurgeSweep();

    assert.equal(result.purged, 2);
    assert.equal(accountService.deleteAccount.mock.calls.length, 2);
    assert.equal(accountService.deleteAccount.mock.calls[0].arguments[0], 'auth0|a');
    assert.equal(accountService.deleteAccount.mock.calls[1].arguments[0], 'auth0|b');
  });

  test('writes a real audit log entry per purged trainer, attributed to "system"', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [{ auth0UserId: 'auth0|a' }]);

    await service.runPurgeSweep();

    assert.equal(adminAudit.logAdminAction.mock.calls.length, 1);
    const [actor, action, targetType, targetId, details] = adminAudit.logAdminAction.mock.calls[0].arguments;
    assert.equal(actor, 'system');
    assert.equal(action, 'trainer.purged');
    assert.equal(targetType, 'TrainerProfile');
    assert.equal(targetId, 'auth0|a');
    assert.deepEqual(details, { auth0DeleteFailed: false });
  });

  test('a real Auth0 deletion failure for one candidate does not stop the sweep or crash it', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [
      { auth0UserId: 'auth0|a' },
      { auth0UserId: 'auth0|b' },
    ]);
    accountService.deleteAccount.mock.mockImplementationOnce(async () => ({ auth0DeleteFailed: true }));

    const result = await service.runPurgeSweep();

    assert.equal(result.purged, 2);
    assert.equal(accountService.deleteAccount.mock.calls.length, 2);
    assert.equal(adminAudit.logAdminAction.mock.calls[0].arguments[4].auth0DeleteFailed, true);
  });
});
