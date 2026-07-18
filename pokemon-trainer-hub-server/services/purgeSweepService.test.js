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

    accountService = {
      deleteAccount: mock.fn(async () => ({ auth0DeleteFailed: false, deletedProfileCount: 1 })),
    };
    mock.module(path.resolve(__dirname, './accountService.js'), { exports: accountService });

    adminAudit = { logAdminAction: mock.fn(async () => {}) };
    mock.module(path.resolve(__dirname, './adminAudit.js'), { exports: adminAudit });

    service = require('./purgeSweepService');
  });

  beforeEach(() => {
    prisma.trainerProfile.findMany.mock.resetCalls();
    prisma.trainerProfile.findMany.mock.mockImplementation(async () => []);
    accountService.deleteAccount.mock.resetCalls();
    accountService.deleteAccount.mock.mockImplementation(async () => ({ auth0DeleteFailed: false, deletedProfileCount: 1 }));
    adminAudit.logAdminAction.mock.resetCalls();
  });

  test('eligibility query requires deletedAt to be set — an active account is never a candidate', async () => {
    await service.runPurgeSweep();

    const where = prisma.trainerProfile.findMany.mock.calls[0].arguments[0].where;
    assert.deepEqual(where.deletedAt, { not: null });
  });

  test('eligibility query requires purgeAt to be set and <= the real current server time — the caller cannot supply this', async () => {
    await service.runPurgeSweep();

    const where = prisma.trainerProfile.findMany.mock.calls[0].arguments[0].where;
    assert.equal(where.purgeAt.not, null);
    assert.ok(where.purgeAt.lte instanceof Date);
    const secondsAgo = (Date.now() - where.purgeAt.lte.getTime()) / 1000;
    assert.ok(secondsAgo >= 0 && secondsAgo < 5);
  });

  test('a soft-deleted account whose purgeAt has not yet arrived is excluded by the query itself (server, not caller, decides eligibility)', async () => {
    // The mock doesn't actually filter — this test documents the contract:
    // the where clause is the only thing that can ever exclude a
    // not-yet-eligible row, and it is built entirely server-side from real
    // DB semantics (deletedAt/purgeAt), never from anything the internal
    // caller sends in the request.
    await service.runPurgeSweep();

    const call = prisma.trainerProfile.findMany.mock.calls[0].arguments[0];
    assert.deepEqual(Object.keys(call.where).sort(), ['deletedAt', 'purgeAt']);
    assert.deepEqual(call.select, { auth0UserId: true });
  });

  test('returns eligible/purged/skipped/failed all zero and touches nothing when there are no candidates', async () => {
    const result = await service.runPurgeSweep();

    assert.deepEqual(result, { eligible: 0, purged: 0, skipped: 0, failed: 0 });
    assert.equal(accountService.deleteAccount.mock.calls.length, 0);
    assert.equal(adminAudit.logAdminAction.mock.calls.length, 0);
  });

  test('calls the real, unmodified deleteAccount for every real candidate', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [
      { auth0UserId: 'auth0|a' },
      { auth0UserId: 'auth0|b' },
    ]);

    const result = await service.runPurgeSweep();

    assert.equal(result.eligible, 2);
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
    accountService.deleteAccount.mock.mockImplementationOnce(async () => ({
      auth0DeleteFailed: true,
      deletedProfileCount: 1,
    }));

    const result = await service.runPurgeSweep();

    assert.equal(result.purged, 2);
    assert.equal(accountService.deleteAccount.mock.calls.length, 2);
    assert.equal(adminAudit.logAdminAction.mock.calls[0].arguments[4].auth0DeleteFailed, true);
  });

  test('a candidate already gone (deletedProfileCount 0 — e.g. removed by a concurrent force-delete or an earlier sweep run) is counted as skipped, not purged, and no audit entry is written for it', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [{ auth0UserId: 'auth0|already-gone' }]);
    accountService.deleteAccount.mock.mockImplementationOnce(async () => ({
      auth0DeleteFailed: false,
      deletedProfileCount: 0,
    }));

    const result = await service.runPurgeSweep();

    assert.deepEqual(result, { eligible: 1, purged: 0, skipped: 1, failed: 0 });
    assert.equal(adminAudit.logAdminAction.mock.calls.length, 0);
  });

  test('one candidate throwing does not stop the rest of the batch from being processed, and is reported as failed, not purged', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [
      { auth0UserId: 'auth0|will-fail' },
      { auth0UserId: 'auth0|will-succeed' },
    ]);
    accountService.deleteAccount.mock.mockImplementationOnce(async () => {
      throw new Error('DB connection dropped mid-transaction');
    });

    const result = await service.runPurgeSweep();

    assert.deepEqual(result, { eligible: 2, purged: 1, skipped: 0, failed: 1 });
    assert.equal(accountService.deleteAccount.mock.calls.length, 2);
    // The second (unrelated, still-eligible) candidate was still purged —
    // one failure never contaminates or blocks the rest of the batch.
    assert.equal(accountService.deleteAccount.mock.calls[1].arguments[0], 'auth0|will-succeed');
    assert.equal(adminAudit.logAdminAction.mock.calls.length, 1);
    assert.equal(adminAudit.logAdminAction.mock.calls[0].arguments[3], 'auth0|will-succeed');
  });

  test('running the sweep twice in a row is safe: the second run naturally finds nothing once the first run purged everything', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [{ auth0UserId: 'auth0|a' }]);
    const first = await service.runPurgeSweep();
    assert.deepEqual(first, { eligible: 1, purged: 1, skipped: 0, failed: 0 });

    // Second run: the real query would no longer return this row since it's
    // gone — the mock models that by returning an empty candidate list.
    const second = await service.runPurgeSweep();
    assert.deepEqual(second, { eligible: 0, purged: 0, skipped: 0, failed: 0 });
  });

  test('the response is aggregate counts only — never an auth0UserId, email, or name', async () => {
    prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [{ auth0UserId: 'auth0|a' }]);

    const result = await service.runPurgeSweep();

    assert.deepEqual(Object.keys(result).sort(), ['eligible', 'failed', 'purged', 'skipped']);
  });
});
