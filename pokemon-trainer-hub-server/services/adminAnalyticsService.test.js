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
      appEvent: {
        findMany: mock.fn(async () => []),
      },
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
    prisma.appEvent.findMany.mock.resetCalls();
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
    prisma.appEvent.findMany.mock.mockImplementation(async () => []);
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
    test('returns all 8 real sections in one combined response', async () => {
      const analytics = await service.getAnalytics(30);

      assert.ok('overTime' in analytics);
      assert.ok('funnel' in analytics);
      assert.ok('popularPokemon' in analytics);
      assert.ok('battleStats' in analytics);
      assert.ok('whosThatStats' in analytics);
      assert.ok('supportStats' in analytics);
      assert.ok('engagement' in analytics);
      assert.ok('retention' in analytics);
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

    test('funnel and overTime queries exclude soft-deleted trainers', async () => {
      await service.getAnalytics(30);

      for (const call of prisma.trainerProfile.count.mock.calls) {
        assert.equal(call.arguments[0].where.deletedAt, null);
      }
      assert.equal(prisma.trainerProfile.findMany.mock.calls[0].arguments[0].where.deletedAt, null);
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
      assert.equal(prisma.trainerProfile.aggregate.mock.calls[0].arguments[0].where.deletedAt, null);
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

    test('engagement and retention are real, computed from AppEvent, and included in the combined response', async () => {
      const now = new Date();
      prisma.appEvent.findMany.mock.mockImplementationOnce(async () => [
        { auth0UserId: 'auth0|a', eventType: 'page_viewed', createdAt: now, metadataJson: null },
      ]);

      const analytics = await service.getAnalytics(30);

      assert.ok(analytics.engagement);
      assert.ok(analytics.retention);
      assert.equal(analytics.engagement.dau, 1);
    });
  });

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  describe('computeEngagementStats', () => {
    test('DAU counts only real, distinct authenticated users active today', () => {
      const now = new Date();
      const events = [
        { auth0UserId: 'auth0|a', eventType: 'page_viewed', createdAt: now, metadataJson: null },
        { auth0UserId: 'auth0|a', eventType: 'session_started', createdAt: now, metadataJson: null }, // same user twice today
        { auth0UserId: 'auth0|b', eventType: 'page_viewed', createdAt: new Date(now.getTime() - 40 * ONE_DAY_MS), metadataJson: null }, // too old
        { auth0UserId: null, eventType: 'page_viewed', createdAt: now, metadataJson: null }, // no real user
      ];

      const stats = service.computeEngagementStats(events, new Date(now.getTime() - 6 * ONE_DAY_MS), 7);

      assert.equal(stats.dau, 1);
    });

    test('MAU includes anyone active in the last 30 days, DAU does not', () => {
      const now = new Date();
      const events = [
        { auth0UserId: 'auth0|a', eventType: 'page_viewed', createdAt: now, metadataJson: null },
        { auth0UserId: 'auth0|b', eventType: 'page_viewed', createdAt: new Date(now.getTime() - 10 * ONE_DAY_MS), metadataJson: null },
      ];

      const stats = service.computeEngagementStats(events, new Date(now.getTime() - 29 * ONE_DAY_MS), 30);

      assert.equal(stats.dau, 1);
      assert.equal(stats.mau, 2);
    });

    test('pageViewsOverTime and sessionsOverTime only count their own real eventType, bucketed by day', () => {
      const now = new Date();
      const events = [
        { auth0UserId: 'auth0|a', eventType: 'page_viewed', createdAt: now, metadataJson: null },
        { auth0UserId: 'auth0|a', eventType: 'page_viewed', createdAt: now, metadataJson: null },
        { auth0UserId: 'auth0|a', eventType: 'session_started', createdAt: now, metadataJson: null },
        { auth0UserId: 'auth0|a', eventType: 'battle_completed', createdAt: now, metadataJson: null },
      ];

      const stats = service.computeEngagementStats(events, new Date(now.getTime() - 2 * ONE_DAY_MS), 3);

      const pageViewTotal = stats.pageViewsOverTime.reduce((sum, d) => sum + d.count, 0);
      const sessionTotal = stats.sessionsOverTime.reduce((sum, d) => sum + d.count, 0);
      assert.equal(pageViewTotal, 2);
      assert.equal(sessionTotal, 1);
    });

    test('featureAdoption reports a real count for every approved feature event, zero when never logged', () => {
      const now = new Date();
      const events = [
        { auth0UserId: 'auth0|a', eventType: 'battle_completed', createdAt: now, metadataJson: null },
        { auth0UserId: 'auth0|a', eventType: 'battle_completed', createdAt: now, metadataJson: null },
      ];

      const stats = service.computeEngagementStats(events, now, 1);

      const battle = stats.featureAdoption.find((f) => f.label === 'battle_completed');
      const quiz = stats.featureAdoption.find((f) => f.label === 'starter_quiz_completed');
      assert.equal(battle.count, 2);
      assert.equal(quiz.count, 0);
    });

    test('aiRequestStats groups by the real feature in metadata and computes a real success rate', () => {
      const now = new Date();
      const events = [
        { auth0UserId: 'auth0|a', eventType: 'ai_request_completed', createdAt: now, metadataJson: JSON.stringify({ feature: 'chat' }) },
        { auth0UserId: 'auth0|a', eventType: 'ai_request_completed', createdAt: now, metadataJson: JSON.stringify({ feature: 'chat' }) },
        { auth0UserId: 'auth0|a', eventType: 'ai_request_failed', createdAt: now, metadataJson: JSON.stringify({ feature: 'chat', reason: 'rate_limited' }) },
      ];

      const stats = service.computeEngagementStats(events, now, 1);

      assert.deepEqual(stats.aiRequestStats, [{ feature: 'chat', completed: 2, failed: 1, successRatePct: 66.7 }]);
    });

    test('a corrupted metadataJson row is grouped as "unknown" instead of crashing the whole page', () => {
      const now = new Date();
      const events = [
        { auth0UserId: 'auth0|a', eventType: 'ai_request_completed', createdAt: now, metadataJson: 'not real json' },
      ];

      const stats = service.computeEngagementStats(events, now, 1);

      assert.equal(stats.aiRequestStats[0].feature, 'unknown');
    });
  });

  describe('computeRetention', () => {
    test('a user is not eligible for Day-1 retention until a full day has actually passed since their first event', () => {
      const events = [{ auth0UserId: 'auth0|a', eventType: 'session_started', createdAt: new Date() }];

      const retention = service.computeRetention(events);

      assert.equal(retention.day1.eligible, 0);
    });

    test('a user who returns exactly on day 1 counts as retained', () => {
      const firstDay = new Date(Date.now() - 2 * ONE_DAY_MS);
      const returnedDay = new Date(firstDay.getTime() + ONE_DAY_MS);
      const events = [
        { auth0UserId: 'auth0|a', eventType: 'session_started', createdAt: firstDay },
        { auth0UserId: 'auth0|a', eventType: 'page_viewed', createdAt: returnedDay },
      ];

      const retention = service.computeRetention(events);

      assert.equal(retention.day1.eligible, 1);
      assert.equal(retention.day1.retained, 1);
      assert.equal(retention.day1.ratePct, 100);
    });

    test('a user who never returns is eligible but not retained', () => {
      const firstDay = new Date(Date.now() - 5 * ONE_DAY_MS);
      const events = [{ auth0UserId: 'auth0|a', eventType: 'session_started', createdAt: firstDay }];

      const retention = service.computeRetention(events);

      assert.equal(retention.day1.eligible, 1);
      assert.equal(retention.day1.retained, 0);
      assert.equal(retention.day1.ratePct, 0);
    });

    test('a null auth0UserId is never counted toward any cohort', () => {
      const events = [{ auth0UserId: null, eventType: 'page_viewed', createdAt: new Date(Date.now() - 5 * ONE_DAY_MS) }];

      const retention = service.computeRetention(events);

      assert.equal(retention.day1.eligible, 0);
    });

    test('ratePct is null (not a fabricated 0) when nobody is eligible yet', () => {
      const retention = service.computeRetention([]);

      assert.equal(retention.day1.ratePct, null);
      assert.equal(retention.day7.ratePct, null);
      assert.equal(retention.day30.ratePct, null);
    });
  });
});
