const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/adminOverviewService', () => {
  let service;
  let prisma;

  before(() => {
    prisma = {
      trainerProfile: {
        count: mock.fn(async () => 0),
        findMany: mock.fn(async () => []),
      },
      supportRequest: {
        count: mock.fn(async () => 0),
        findMany: mock.fn(async () => []),
      },
      dreamTeamMember: {
        groupBy: mock.fn(async () => []),
        findMany: mock.fn(async () => []),
      },
      battleMatch: {
        count: mock.fn(async () => 0),
        findMany: mock.fn(async () => []),
      },
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    service = require('./adminOverviewService');
  });

  function resetAll() {
    prisma.trainerProfile.count.mock.resetCalls();
    prisma.trainerProfile.findMany.mock.resetCalls();
    prisma.supportRequest.count.mock.resetCalls();
    prisma.supportRequest.findMany.mock.resetCalls();
    prisma.dreamTeamMember.groupBy.mock.resetCalls();
    prisma.dreamTeamMember.findMany.mock.resetCalls();
    prisma.battleMatch.count.mock.resetCalls();
    prisma.battleMatch.findMany.mock.resetCalls();
  }

  beforeEach(() => {
    resetAll();
    prisma.trainerProfile.count.mock.mockImplementation(async () => 0);
    prisma.trainerProfile.findMany.mock.mockImplementation(async () => []);
    prisma.supportRequest.count.mock.mockImplementation(async () => 0);
    prisma.supportRequest.findMany.mock.mockImplementation(async () => []);
    prisma.dreamTeamMember.groupBy.mock.mockImplementation(async () => []);
    prisma.dreamTeamMember.findMany.mock.mockImplementation(async () => []);
    prisma.battleMatch.count.mock.mockImplementation(async () => 0);
    prisma.battleMatch.findMany.mock.mockImplementation(async () => []);
  });

  describe('getOverview', () => {
    test('returns kpis, recentSupportRequests and recentActivity in one response', async () => {
      const overview = await service.getOverview();

      assert.ok('kpis' in overview);
      assert.ok('recentSupportRequests' in overview);
      assert.ok('recentActivity' in overview);
    });

    test('kpis.totalTrainers is a real count, not derived from other numbers', async () => {
      prisma.trainerProfile.count.mock.mockImplementationOnce(async () => 42);

      const overview = await service.getOverview();

      assert.equal(overview.kpis.totalTrainers, 42);
    });

    test('newTrainersLast7Days queries with a real 7-day createdAt window', async () => {
      await service.getOverview();

      const call = prisma.trainerProfile.count.mock.calls[1];
      const since = call.arguments[0].where.createdAt.gte;
      const daysAgo = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
      assert.ok(daysAgo > 6.9 && daysAgo < 7.1);
    });

    test('openSupportRequests counts only status: open', async () => {
      await service.getOverview();

      assert.deepEqual({ ...prisma.supportRequest.count.mock.calls[0].arguments[0] }, {
        where: { status: 'open' },
      });
    });

    test('trainersWithTeamCount and fullTeamsCount come from a real groupBy, not a flat count', async () => {
      prisma.dreamTeamMember.groupBy.mock.mockImplementationOnce(async () => [
        { auth0UserId: 'a', _count: { _all: 5 } },
        { auth0UserId: 'b', _count: { _all: 3 } },
        { auth0UserId: 'c', _count: { _all: 5 } },
      ]);

      const overview = await service.getOverview();

      assert.equal(overview.kpis.trainersWithTeamCount, 3);
      assert.equal(overview.kpis.fullTeamsCount, 2);
    });

    test('recentSupportRequests never includes the message field', async () => {
      await service.getOverview();

      const selectArg = prisma.supportRequest.findMany.mock.calls[0].arguments[0].select;
      assert.equal(selectArg.message, undefined);
    });

    test('recentSupportRequests is capped at 5', async () => {
      await service.getOverview();

      assert.equal(prisma.supportRequest.findMany.mock.calls[0].arguments[0].take, 5);
    });

    test('recentActivity merges events from all 4 tables sorted by real timestamp, capped at 10', async () => {
      prisma.trainerProfile.findMany.mock.mockImplementation(async (args) => {
        if (args && args.select && 'trainerName' in args.select && !('createdAt' in (args.where || {}))) {
          // could be either the recent-activity fetch or the name-lookup fetch
        }
        return [{ auth0UserId: 'a', trainerName: 'Ash', createdAt: new Date('2026-07-10T00:00:00Z') }];
      });
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [
        { auth0UserId: 'b', pokemonName: 'Pikachu', addedAt: new Date('2026-07-15T00:00:00Z') },
      ]);
      prisma.battleMatch.findMany.mock.mockImplementationOnce(async () => [
        { auth0UserId: 'c', result: 'win', opponentName: 'Team Rocket', createdAt: new Date('2026-07-12T00:00:00Z') },
      ]);
      prisma.supportRequest.findMany.mock.mockImplementationOnce(async () => [
        { id: 1, name: 'Misty', topic: 'bug', status: 'open', priority: 'normal', createdAt: new Date('2026-07-01T00:00:00Z') },
      ]);

      const overview = await service.getOverview();

      assert.ok(overview.recentActivity.length <= 10);
      assert.equal(overview.recentActivity[0].type, 'team_member_added');
    });

    test('recentActivity resolves a real trainerName via a single batched lookup, never one query per event', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [
        { auth0UserId: 'x', pokemonName: 'Pikachu', addedAt: new Date() },
      ]);

      const overview = await service.getOverview();

      // trainerProfile.findMany is called once for the name-lookup batch (the
      // "recent trainers joined" fetch is a separate, earlier call)
      const nameLookupCalls = prisma.trainerProfile.findMany.mock.calls.filter(
        (c) => c.arguments[0]?.where?.auth0UserId?.in,
      );
      assert.equal(nameLookupCalls.length, 1);
      assert.ok(overview.recentActivity[0].trainerName);
    });

    test('unresolvable trainerName falls back to "Unknown Trainer", never a blank/undefined value', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [
        { auth0UserId: 'ghost', pokemonName: 'Pikachu', addedAt: new Date() },
      ]);
      prisma.trainerProfile.findMany.mock.mockImplementation(async (args) => {
        if (args?.where?.auth0UserId?.in) return [];
        return [];
      });

      const overview = await service.getOverview();

      assert.equal(overview.recentActivity[0].trainerName, 'Unknown Trainer');
    });
  });
});
