const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/adminTrainerService', () => {
  let service;
  let prisma;
  let teamService;
  const USER_A = 'auth0|trainer-a';
  const USER_B = 'auth0|trainer-b';

  function profileRow(overrides = {}) {
    return {
      auth0UserId: USER_A,
      trainerName: 'Ash',
      country: 'Japan',
      dateOfBirth: new Date('2000-01-01'),
      favoriteType: 'electric',
      experienceLevel: 'Beginner',
      teamName: null,
      marketingEmailsOptIn: false,
      acceptedPolicy: true,
      acceptedPolicyAt: new Date('2025-01-01'),
      policyVersion: 'v1',
      hasCompletedStarterQuiz: true,
      whosThatBestStreak: 5,
      createdAt: new Date('2025-01-01'),
      deletedAt: null,
      purgeAt: null,
      deletedBy: null,
      deletionType: null,
      ...overrides,
    };
  }

  before(() => {
    prisma = {
      trainerProfile: {
        findMany: mock.fn(async () => [profileRow()]),
        count: mock.fn(async () => 1),
        findUnique: mock.fn(async () => profileRow()),
      },
      dreamTeamMember: { groupBy: mock.fn(async () => []) },
      favorite: { groupBy: mock.fn(async () => []), count: mock.fn(async () => 0) },
      battleMatch: { groupBy: mock.fn(async () => []), findMany: mock.fn(async () => []) },
      supportRequest: { findMany: mock.fn(async () => []) },
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    teamService = { getTeam: mock.fn(async () => []) };
    mock.module(path.resolve(__dirname, './teamService.js'), { exports: teamService });

    service = require('./adminTrainerService');
  });

  function resetAll() {
    prisma.trainerProfile.findMany.mock.resetCalls();
    prisma.trainerProfile.count.mock.resetCalls();
    prisma.trainerProfile.findUnique.mock.resetCalls();
    prisma.dreamTeamMember.groupBy.mock.resetCalls();
    prisma.favorite.groupBy.mock.resetCalls();
    prisma.favorite.count.mock.resetCalls();
    prisma.battleMatch.groupBy.mock.resetCalls();
    prisma.battleMatch.findMany.mock.resetCalls();
    prisma.supportRequest.findMany.mock.resetCalls();
    teamService.getTeam.mock.resetCalls();
  }

  beforeEach(() => {
    resetAll();
    prisma.trainerProfile.findMany.mock.mockImplementation(async () => [profileRow()]);
    prisma.trainerProfile.count.mock.mockImplementation(async () => 1);
    prisma.trainerProfile.findUnique.mock.mockImplementation(async () => profileRow());
    prisma.dreamTeamMember.groupBy.mock.mockImplementation(async () => []);
    prisma.favorite.groupBy.mock.mockImplementation(async () => []);
    prisma.favorite.count.mock.mockImplementation(async () => 0);
    prisma.battleMatch.groupBy.mock.mockImplementation(async () => []);
    prisma.battleMatch.findMany.mock.mockImplementation(async () => []);
    prisma.supportRequest.findMany.mock.mockImplementation(async () => []);
    teamService.getTeam.mock.mockImplementation(async () => []);
  });

  describe('list', () => {
    test('paginates TrainerProfile as the anchor, computing a real ageRange', async () => {
      const result = await service.list({});

      assert.equal(result.results.length, 1);
      assert.ok(result.results[0].ageRange);
      assert.equal(result.results[0].trainerName, 'Ash');
    });

    test('never includes an email field — TrainerProfile does not store one', async () => {
      const result = await service.list({});
      assert.equal('email' in result.results[0], false);
    });

    test('merges real team/favorite/battle counts from 3 scoped groupBy queries, not per-row', async () => {
      prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [
        profileRow({ auth0UserId: USER_A }),
        profileRow({ auth0UserId: USER_B, trainerName: 'Misty' }),
      ]);
      prisma.dreamTeamMember.groupBy.mock.mockImplementationOnce(async () => [
        { auth0UserId: USER_A, _count: { _all: 3 } },
      ]);
      prisma.favorite.groupBy.mock.mockImplementationOnce(async () => [
        { auth0UserId: USER_B, _count: { _all: 7 } },
      ]);

      const result = await service.list({});

      assert.equal(prisma.dreamTeamMember.groupBy.mock.calls.length, 1);
      assert.equal(prisma.favorite.groupBy.mock.calls.length, 1);
      assert.equal(prisma.battleMatch.groupBy.mock.calls.length, 1);

      const a = result.results.find((r) => r.auth0UserId === USER_A);
      const b = result.results.find((r) => r.auth0UserId === USER_B);
      assert.equal(a.teamSize, 3);
      assert.equal(a.favoritesCount, 0);
      assert.equal(b.teamSize, 0);
      assert.equal(b.favoritesCount, 7);
    });

    test('caps an excessive pageSize at 100', async () => {
      await service.list({ pageSize: 9999 });
      assert.equal(prisma.trainerProfile.findMany.mock.calls[0].arguments[0].take, 100);
    });

    test('filters by search (trainerName contains)', async () => {
      await service.list({ search: 'ash' });
      assert.deepEqual(prisma.trainerProfile.findMany.mock.calls[0].arguments[0].where.trainerName, {
        contains: 'ash',
      });
    });

    test('excludes soft-deleted trainers — they live in the separate Recently Deleted view', async () => {
      await service.list({});
      assert.equal(prisma.trainerProfile.findMany.mock.calls[0].arguments[0].where.deletedAt, null);
      assert.equal(prisma.trainerProfile.count.mock.calls[0].arguments[0].where.deletedAt, null);
    });
  });

  describe('getDetail', () => {
    test('returns null when no profile exists', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => null);
      assert.equal(await service.getDetail('auth0|nobody'), null);
    });

    test('reuses teamService.getTeam() rather than reimplementing it', async () => {
      teamService.getTeam.mock.mockImplementationOnce(async () => [{ pokemonId: 25, pokemonName: 'pikachu' }]);

      const detail = await service.getDetail(USER_A);

      assert.equal(teamService.getTeam.mock.calls.length, 1);
      assert.equal(teamService.getTeam.mock.calls[0].arguments[0], USER_A);
      assert.deepEqual(detail.team, [{ pokemonId: 25, pokemonName: 'pikachu' }]);
    });

    test('computes real win/loss counts and a real difficulty breakdown from BattleMatch rows', async () => {
      prisma.battleMatch.findMany.mock.mockImplementationOnce(async () => [
        { id: 1, result: 'win', difficulty: 'easy', opponentName: 'Rival', yourWins: 3, oppWins: 1, createdAt: new Date() },
        { id: 2, result: 'loss', difficulty: 'hard', opponentName: 'Rival', yourWins: 1, oppWins: 3, createdAt: new Date() },
        { id: 3, result: 'win', difficulty: 'easy', opponentName: 'Rival', yourWins: 3, oppWins: 0, createdAt: new Date() },
      ]);

      const detail = await service.getDetail(USER_A);

      assert.equal(detail.battles.total, 3);
      assert.equal(detail.battles.wins, 2);
      assert.equal(detail.battles.losses, 1);
      assert.deepEqual(detail.battles.difficultyBreakdown, { easy: 2, hard: 1 });
    });

    test('passes the real soft-delete fields through unfiltered, so a deleted trainer\'s own detail page still loads', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () =>
        profileRow({
          deletedAt: new Date('2026-07-01'),
          purgeAt: new Date('2026-07-31'),
          deletedBy: 'auth0|admin-xyz',
          deletionType: 'admin',
        }),
      );

      const detail = await service.getDetail(USER_A);

      assert.deepEqual(detail.profile.deletedAt, new Date('2026-07-01'));
      assert.deepEqual(detail.profile.purgeAt, new Date('2026-07-31'));
      assert.equal(detail.profile.deletedBy, 'auth0|admin-xyz');
      assert.equal(detail.profile.deletionType, 'admin');
    });

    test('never includes TrainerNote content — not queried at all', async () => {
      const detail = await service.getDetail(USER_A);
      assert.equal('notes' in detail, false);
      assert.equal('trainerNotes' in detail, false);
    });

    test('includes the trainer\'s own support requests, most recent first, without the full message body', async () => {
      prisma.supportRequest.findMany.mock.mockImplementationOnce(async () => [
        { id: 1, topic: 'Bug', status: 'open', priority: 'normal', createdAt: new Date() },
      ]);

      const detail = await service.getDetail(USER_A);

      assert.equal(detail.supportRequests.length, 1);
      const selectArg = prisma.supportRequest.findMany.mock.calls[0].arguments[0].select;
      assert.equal(selectArg.message, undefined);
    });
  });
});
