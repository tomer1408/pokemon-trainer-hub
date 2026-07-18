const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/adminAnalyticsService', () => {
  let service;
  let prisma;

  before(() => {
    prisma = {
      trainerProfile: {
        count: mock.fn(async () => 0),
        findMany: mock.fn(async () => []),
        aggregate: mock.fn(async () => ({ _avg: { whosThatBestStreak: 0 }, _max: { whosThatBestStreak: 0 } })),
      },
      battleMatch: {
        findMany: mock.fn(async () => []),
        groupBy: mock.fn(async () => []),
      },
      dreamTeamMember: { groupBy: mock.fn(async () => []) },
      favorite: { groupBy: mock.fn(async () => []) },
      supportRequest: { groupBy: mock.fn(async () => []) },
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    service = require('./adminAnalyticsService');
  });

  function resetAll() {
    prisma.trainerProfile.count.mock.resetCalls();
    prisma.trainerProfile.findMany.mock.resetCalls();
    prisma.trainerProfile.aggregate.mock.resetCalls();
    prisma.battleMatch.findMany.mock.resetCalls();
    prisma.battleMatch.groupBy.mock.resetCalls();
    prisma.dreamTeamMember.groupBy.mock.resetCalls();
    prisma.favorite.groupBy.mock.resetCalls();
    prisma.supportRequest.groupBy.mock.resetCalls();
  }

  beforeEach(() => {
    resetAll();
    prisma.trainerProfile.count.mock.mockImplementation(async () => 0);
    prisma.trainerProfile.findMany.mock.mockImplementation(async () => []);
    prisma.trainerProfile.aggregate.mock.mockImplementation(async () => ({
      _avg: { whosThatBestStreak: 0 },
      _max: { whosThatBestStreak: 0 },
    }));
    prisma.battleMatch.findMany.mock.mockImplementation(async () => []);
    prisma.battleMatch.groupBy.mock.mockImplementation(async () => []);
    prisma.dreamTeamMember.groupBy.mock.mockImplementation(async () => []);
    prisma.favorite.groupBy.mock.mockImplementation(async () => []);
    prisma.supportRequest.groupBy.mock.mockImplementation(async () => []);
  });

  describe('normalizeDays', () => {
    test('defaults to 30 for a missing/invalid value', () => {
      assert.equal(service.normalizeDays(undefined), 30);
      assert.equal(service.normalizeDays('not-a-number'), 30);
      assert.equal(service.normalizeDays(-5), 30);
    });

    test('clamps below the minimum up to 7', () => {
      assert.equal(service.normalizeDays(1), 7);
    });

    test('clamps above the maximum down to 180', () => {
      assert.equal(service.normalizeDays(9999), 180);
    });

    test('passes a valid in-range value through unchanged', () => {
      assert.equal(service.normalizeDays(14), 14);
    });
  });

  describe('getAnalytics', () => {
    test('returns all 6 real sections in one combined response', async () => {
      const analytics = await service.getAnalytics(30);

      assert.ok('overTime' in analytics);
      assert.ok('funnel' in analytics);
      assert.ok('popularPokemon' in analytics);
      assert.ok('battleStats' in analytics);
      assert.ok('whosThatStats' in analytics);
      assert.ok('supportStats' in analytics);
      assert.equal(analytics.days, 30);
    });

    test('overTime buckets real timestamps into a dense, zero-filled daily series', async () => {
      prisma.trainerProfile.findMany.mock.mockImplementationOnce(async () => [
        { createdAt: new Date() },
        { createdAt: new Date() },
      ]);

      const analytics = await service.getAnalytics(7);

      assert.equal(analytics.overTime.profiles.length, 7);
      const total = analytics.overTime.profiles.reduce((sum, d) => sum + d.count, 0);
      assert.equal(total, 2);
    });

    test('funnel reflects real sequential counts, hasTeam/fullTeam from a real groupBy not a flat count', async () => {
      prisma.trainerProfile.count.mock.mockImplementation(async (args) => {
        if (args?.where?.hasCompletedStarterQuiz) return 3;
        return 10;
      });
      prisma.dreamTeamMember.groupBy.mock.mockImplementationOnce(async () => [
        { auth0UserId: 'a', _count: { _all: 5 } },
        { auth0UserId: 'b', _count: { _all: 2 } },
      ]);
      prisma.battleMatch.groupBy.mock.mockImplementationOnce(async () => [{ auth0UserId: 'a', _count: { _all: 4 } }]);

      const analytics = await service.getAnalytics(30);

      assert.equal(analytics.funnel[0].count, 10);
      assert.equal(analytics.funnel[1].count, 3);
      assert.equal(analytics.funnel[2].count, 2);
      assert.equal(analytics.funnel[3].count, 1);
      assert.equal(analytics.funnel[4].count, 1);
    });

    test('popularPokemon comes from real groupBy on DreamTeamMember and Favorite', async () => {
      // dreamTeamMember.groupBy is also called by getFunnel() (grouped by
      // auth0UserId, concurrently) — branch on the real `by` field instead
      // of assuming call order, since Promise.all doesn't guarantee it.
      prisma.dreamTeamMember.groupBy.mock.mockImplementation(async (args) =>
        args.by[0] === 'pokemonId' ? [{ pokemonId: 25, pokemonName: 'pikachu', _count: { _all: 12 } }] : [],
      );
      prisma.favorite.groupBy.mock.mockImplementationOnce(async () => [
        { pokemonId: 6, pokemonName: 'charizard', _count: { _all: 8 } },
      ]);

      const analytics = await service.getAnalytics(30);

      assert.deepEqual(analytics.popularPokemon.inTeams[0], { pokemonId: 25, pokemonName: 'pikachu', count: 12 });
      assert.deepEqual(analytics.popularPokemon.favorited[0], { pokemonId: 6, pokemonName: 'charizard', count: 8 });
    });

    test('battleStats reflects real result/difficulty/opponentType groupBys', async () => {
      prisma.battleMatch.groupBy.mock.mockImplementation(async (args) => {
        if (args.by[0] === 'result') return [{ result: 'win', _count: { _all: 7 } }, { result: 'loss', _count: { _all: 3 } }];
        if (args.by[0] === 'difficulty') return [{ difficulty: 'Hard', _count: { _all: 4 } }];
        if (args.by[0] === 'opponentType') return [{ opponentType: 'fire', _count: { _all: 5 } }];
        return [];
      });

      const analytics = await service.getAnalytics(30);

      assert.deepEqual(analytics.battleStats.results, [
        { label: 'win', count: 7 },
        { label: 'loss', count: 3 },
      ]);
      assert.deepEqual(analytics.battleStats.byDifficulty, [{ label: 'Hard', count: 4 }]);
      assert.deepEqual(analytics.battleStats.byOpponentType, [{ label: 'fire', count: 5 }]);
    });

    test('whosThatStats aggregates the real whosThatBestStreak field, never invented per-round history', async () => {
      prisma.trainerProfile.aggregate.mock.mockImplementationOnce(async () => ({
        _avg: { whosThatBestStreak: 4.666 },
        _max: { whosThatBestStreak: 12 },
      }));
      // trainerProfile.count is also called (twice) by getFunnel(),
      // concurrently — branch on the real `where` shape instead of
      // assuming call order.
      prisma.trainerProfile.count.mock.mockImplementation(async (args) =>
        args?.where?.whosThatBestStreak ? 9 : 0,
      );

      const analytics = await service.getAnalytics(30);

      assert.equal(analytics.whosThatStats.averageBestStreak, 4.7);
      assert.equal(analytics.whosThatStats.highestBestStreak, 12);
      assert.equal(analytics.whosThatStats.trainersWhoHavePlayed, 9);
    });

    test('supportStats comes from real topic/status groupBys', async () => {
      prisma.supportRequest.groupBy.mock.mockImplementation(async (args) => {
        if (args.by[0] === 'topic') return [{ topic: 'billing', _count: { _all: 6 } }];
        if (args.by[0] === 'status') return [{ status: 'open', _count: { _all: 3 } }];
        return [];
      });

      const analytics = await service.getAnalytics(30);

      assert.deepEqual(analytics.supportStats.byTopic, [{ label: 'billing', count: 6 }]);
      assert.deepEqual(analytics.supportStats.byStatus, [{ label: 'open', count: 3 }]);
    });
  });
});
