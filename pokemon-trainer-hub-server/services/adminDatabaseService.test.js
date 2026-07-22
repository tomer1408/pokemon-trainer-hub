const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/adminDatabaseService', () => {
  let service;
  let prisma;

  function modelMock(rows = []) {
    return {
      findMany: mock.fn(async () => rows),
      count: mock.fn(async () => rows.length),
      findUnique: mock.fn(async () => rows[0] ?? null),
    };
  }

  before(() => {
    prisma = {
      trainerProfile: modelMock(),
      dreamTeamMember: modelMock(),
      favorite: modelMock(),
      trainerNote: modelMock(),
      supportRequest: modelMock(),
      battleMatch: modelMock(),
      avatarIcon: modelMock(),
      adminAuditLog: modelMock(),
      appEvent: modelMock(),
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    service = require('./adminDatabaseService');
  });

  function resetAll() {
    for (const key of Object.keys(prisma)) {
      prisma[key].findMany.mock.resetCalls();
      prisma[key].count.mock.resetCalls();
      prisma[key].findUnique.mock.resetCalls();
    }
  }

  beforeEach(resetAll);

  describe('listTables', () => {
    test('returns a real count per registered model, exactly one query per table', async () => {
      const tables = await service.listTables();

      assert.equal(tables.length, 9);
      const trainerProfiles = tables.find((t) => t.key === 'trainerProfiles');
      assert.ok(trainerProfiles);
      assert.equal(typeof trainerProfiles.count, 'number');
      assert.equal(prisma.trainerProfile.count.mock.calls.length, 1);
    });
  });

  describe('listRecords', () => {
    test('paginates with the real, capped pageSize', async () => {
      await service.listRecords('trainerProfiles', { page: 2, pageSize: 9999 });

      const call = prisma.trainerProfile.findMany.mock.calls[0].arguments[0];
      assert.equal(call.take, 100);
      assert.equal(call.skip, 100);
    });

    test('falls back to the table default sort when sortBy is not in that table\'s allowlist', async () => {
      await service.listRecords('trainerProfiles', { sortBy: 'DROP TABLE trainerProfile;' });

      const call = prisma.trainerProfile.findMany.mock.calls[0].arguments[0];
      assert.deepEqual(call.orderBy, { createdAt: 'desc' });
    });

    test('honors a real sortBy value that is in the allowlist', async () => {
      await service.listRecords('trainerProfiles', { sortBy: 'trainerName', sortDirection: 'asc' });

      const call = prisma.trainerProfile.findMany.mock.calls[0].arguments[0];
      assert.deepEqual(call.orderBy, { trainerName: 'asc' });
    });

    test('builds an OR search only across that table\'s real searchable fields', async () => {
      await service.listRecords('trainerProfiles', { search: 'ash' });

      const call = prisma.trainerProfile.findMany.mock.calls[0].arguments[0];
      assert.deepEqual(call.where, {
        OR: [
          { trainerName: { contains: 'ash' } },
          { country: { contains: 'ash' } },
          { teamName: { contains: 'ash' } },
        ],
      });
    });

    test('search is a no-op for a table with no searchable fields (e.g. trainerNotes)', async () => {
      await service.listRecords('trainerNotes', { search: 'anything' });

      const call = prisma.trainerNote.findMany.mock.calls[0].arguments[0];
      assert.deepEqual(call.where, {});
    });

    test('returns rows already masked through the registry\'s toSafeRow, never the raw row', async () => {
      prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [
        { id: 1, auth0UserId: 'auth0|64f2b3c1a9d8e7f6', trainerName: 'Ash', dateOfBirth: new Date('2000-01-01') },
      ]);

      const { results } = await service.listRecords('trainerProfiles', {});

      assert.notEqual(results[0].auth0UserId, 'auth0|64f2b3c1a9d8e7f6');
      assert.equal('dateOfBirth' in results[0], false);
    });
  });

  describe('getRecord', () => {
    test('returns null for a record that does not exist, never throws', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => null);

      const record = await service.getRecord('trainerProfiles', 999);

      assert.equal(record, null);
    });

    test('uses the real toSafeDetail override when the registry entry has one (battleMatches)', async () => {
      prisma.battleMatch.findUnique.mock.mockImplementationOnce(async () => ({
        id: 1,
        auth0UserId: 'auth0|abc',
        opponentName: 'Team Rocket',
        difficulty: 'Hard',
        rounds: 3,
        roundsPlayed: 2,
        opponentType: 'fire',
        luckFactor: 'normal',
        result: 'win',
        yourWins: 2,
        oppWins: 0,
        roundsJson: '[{"round":1}]',
        teamSnapshotJson: '[]',
        createdAt: new Date(),
      }));

      const record = await service.getRecord('battleMatches', 1);

      assert.equal(record.roundsJson, '[{"round":1}]');
    });

    test('falls back to toSafeRow when the registry entry has no toSafeDetail override', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        id: 1,
        auth0UserId: 'auth0|64f2b3c1a9d8e7f6',
        trainerName: 'Ash',
        dateOfBirth: new Date('2000-01-01'),
      }));

      const record = await service.getRecord('trainerProfiles', 1);

      assert.notEqual(record.auth0UserId, 'auth0|64f2b3c1a9d8e7f6');
    });
  });
});
