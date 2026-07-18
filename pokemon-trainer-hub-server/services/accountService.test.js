const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Mocks services/prisma.js (same "default" wrapper convention as
// middleware/auth.js) and services/auth0Management.js (destructured named
// export) so this never touches a real database or a real Auth0 tenant.
describe('services/accountService', () => {
  let accountService;
  let prisma;
  let auth0Management;
  const USER = 'auth0|test-user';

  before(() => {
    prisma = {
      trainerNote: { deleteMany: mock.fn(async () => ({ count: 1 })) },
      favorite: { deleteMany: mock.fn(async () => ({ count: 1 })) },
      supportRequest: { deleteMany: mock.fn(async () => ({ count: 1 })) },
      battleMatch: { deleteMany: mock.fn(async () => ({ count: 1 })) },
      dreamTeamMember: { deleteMany: mock.fn(async () => ({ count: 1 })) },
      trainerProfile: {
        deleteMany: mock.fn(async () => ({ count: 1 })),
        update: mock.fn(async () => ({})),
      },
      $transaction: mock.fn(async (ops) => Promise.all(ops)),
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    auth0Management = { deleteAuth0User: mock.fn(async () => {}) };
    mock.module(path.resolve(__dirname, './auth0Management.js'), { exports: auth0Management });

    accountService = require('./accountService');
  });

  beforeEach(() => {
    for (const table of [
      'trainerNote',
      'favorite',
      'supportRequest',
      'battleMatch',
      'dreamTeamMember',
      'trainerProfile',
    ]) {
      prisma[table].deleteMany.mock.resetCalls();
      prisma[table].deleteMany.mock.mockImplementation(async () => ({ count: 1 }));
    }
    prisma.trainerProfile.update.mock.resetCalls();
    prisma.trainerProfile.update.mock.mockImplementation(async () => ({}));
    prisma.$transaction.mock.resetCalls();
    prisma.$transaction.mock.mockImplementation(async (ops) => Promise.all(ops));
    auth0Management.deleteAuth0User.mock.resetCalls();
    auth0Management.deleteAuth0User.mock.mockImplementation(async () => {});
  });

  test('deletes all 6 tables scoped to auth0UserId, inside one transaction', async () => {
    await accountService.deleteAccount(USER);

    assert.equal(prisma.$transaction.mock.calls.length, 1);
    for (const table of [
      'trainerNote',
      'favorite',
      'supportRequest',
      'battleMatch',
      'dreamTeamMember',
      'trainerProfile',
    ]) {
      assert.equal(prisma[table].deleteMany.mock.calls.length, 1);
      assert.deepEqual(prisma[table].deleteMany.mock.calls[0].arguments[0], { where: { auth0UserId: USER } });
    }
  });

  test('uses deleteMany (not delete) for trainerProfile, so a trainer with no profile row is not an error', async () => {
    // deleteMany on zero matching rows resolves with count: 0 rather than
    // throwing — this test documents that expectation directly.
    prisma.trainerProfile.deleteMany.mock.mockImplementationOnce(async () => ({ count: 0 }));

    await assert.doesNotReject(accountService.deleteAccount(USER));
  });

  test('deletes the real Auth0 identity after the DB transaction commits', async () => {
    const result = await accountService.deleteAccount(USER);

    assert.equal(auth0Management.deleteAuth0User.mock.calls.length, 1);
    assert.equal(auth0Management.deleteAuth0User.mock.calls[0].arguments[0], USER);
    assert.deepEqual(result, { auth0DeleteFailed: false });
  });

  test('when the Auth0 deletion fails, the DB deletion still stands and the function does not throw', async () => {
    auth0Management.deleteAuth0User.mock.mockImplementationOnce(async () => {
      throw new Error('Auth0 is down');
    });

    const result = await accountService.deleteAccount(USER);

    assert.equal(prisma.$transaction.mock.calls.length, 1); // DB half already ran
    assert.deepEqual(result, { auth0DeleteFailed: true });
  });

  test('when the DB transaction itself rejects, Auth0 deletion is never attempted (proves the ordering)', async () => {
    prisma.$transaction.mock.mockImplementationOnce(async () => {
      throw new Error('DB is down');
    });

    await assert.rejects(accountService.deleteAccount(USER));
    assert.equal(auth0Management.deleteAuth0User.mock.calls.length, 0);
  });

  describe('softDeleteAccount', () => {
    test('updates only TrainerProfile — never touches the other 5 tables or Auth0', async () => {
      await accountService.softDeleteAccount(USER, { deletedBy: USER, deletionType: 'self' });

      assert.equal(prisma.trainerProfile.update.mock.calls.length, 1);
      assert.equal(prisma.$transaction.mock.calls.length, 0);
      assert.equal(auth0Management.deleteAuth0User.mock.calls.length, 0);
      for (const table of ['trainerNote', 'favorite', 'supportRequest', 'battleMatch', 'dreamTeamMember']) {
        assert.equal(prisma[table].deleteMany.mock.calls.length, 0);
      }
    });

    test('sets deletedAt to now and purgeAt exactly 30 days later', async () => {
      const before = Date.now();
      await accountService.softDeleteAccount(USER, { deletedBy: USER, deletionType: 'self' });
      const after = Date.now();

      const data = prisma.trainerProfile.update.mock.calls[0].arguments[0].data;
      assert.ok(data.deletedAt.getTime() >= before && data.deletedAt.getTime() <= after);
      const diffDays = (data.purgeAt.getTime() - data.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
      assert.equal(diffDays, 30);
    });

    test('records the real acting user and deletion type', async () => {
      await accountService.softDeleteAccount(USER, { deletedBy: 'auth0|admin-abc', deletionType: 'admin' });

      const data = prisma.trainerProfile.update.mock.calls[0].arguments[0].data;
      assert.equal(data.deletedBy, 'auth0|admin-abc');
      assert.equal(data.deletionType, 'admin');
    });

    test('rejects an invalid deletionType before ever touching the database', async () => {
      await assert.rejects(
        accountService.softDeleteAccount(USER, { deletedBy: USER, deletionType: 'not-a-real-type' }),
        (err) => err.code === 'INVALID_DELETION_TYPE',
      );
      assert.equal(prisma.trainerProfile.update.mock.calls.length, 0);
    });
  });

  describe('restoreAccount', () => {
    test('clears all 4 soft-delete fields in one update, nothing else', async () => {
      await accountService.restoreAccount(USER);

      assert.equal(prisma.trainerProfile.update.mock.calls.length, 1);
      const call = prisma.trainerProfile.update.mock.calls[0].arguments[0];
      assert.deepEqual(call.where, { auth0UserId: USER });
      assert.deepEqual(call.data, { deletedAt: null, purgeAt: null, deletedBy: null, deletionType: null });
      assert.equal(prisma.$transaction.mock.calls.length, 0);
      assert.equal(auth0Management.deleteAuth0User.mock.calls.length, 0);
    });
  });
});
