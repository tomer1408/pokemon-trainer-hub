const prisma = require('./prisma');

const RECENT_ACTIVITY_LIMIT = 10;
const RECENT_SUPPORT_LIMIT = 5;
// How many of each event type to fetch before merging+sorting — comfortably
// more than RECENT_ACTIVITY_LIMIT so a burst in one table can't crowd out
// genuinely more-recent events from another.
const PER_TABLE_FETCH_LIMIT = 10;

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
}

// Real counts only — every number here is a genuine count/groupBy query,
// never invented. "Users with at least one team member" / "full 5-member
// teams" both need a per-trainer count, not a flat row count, so they go
// through groupBy (same technique already used in adminTrainerService.js)
// rather than a plain .count().
async function getKpis() {
  const since = sevenDaysAgo();

  const [totalTrainers, newTrainersLast7Days, openSupportRequests, quizCompletedCount, teamGroups, battlesLast7Days] =
    await Promise.all([
      prisma.trainerProfile.count({ where: { deletedAt: null } }),
      prisma.trainerProfile.count({ where: { deletedAt: null, createdAt: { gte: since } } }),
      prisma.supportRequest.count({ where: { status: 'open' } }),
      prisma.trainerProfile.count({ where: { deletedAt: null, hasCompletedStarterQuiz: true } }),
      prisma.dreamTeamMember.groupBy({ by: ['auth0UserId'], _count: { _all: true } }),
      prisma.battleMatch.count({ where: { createdAt: { gte: since } } }),
    ]);

  return {
    totalTrainers,
    newTrainersLast7Days,
    openSupportRequests,
    quizCompletedCount,
    trainersWithTeamCount: teamGroups.length,
    fullTeamsCount: teamGroups.filter((g) => g._count._all === 5).length,
    battlesLast7Days,
  };
}

async function getRecentSupportRequests() {
  return prisma.supportRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: RECENT_SUPPORT_LIMIT,
    select: { id: true, name: true, topic: true, status: true, priority: true, createdAt: true },
  });
}

// Merges the most recent real events from 4 independent tables into one
// feed — there's no dedicated activity-log table (deliberately not adding
// one just for this), so this derives "activity" from each table's own
// existing timestamp column.
async function getRecentActivity() {
  const [newTrainers, teamAdditions, battles, supportRequests] = await Promise.all([
    prisma.trainerProfile.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: PER_TABLE_FETCH_LIMIT,
      select: { auth0UserId: true, trainerName: true, createdAt: true },
    }),
    prisma.dreamTeamMember.findMany({
      orderBy: { addedAt: 'desc' },
      take: PER_TABLE_FETCH_LIMIT,
      select: { auth0UserId: true, pokemonName: true, addedAt: true },
    }),
    prisma.battleMatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: PER_TABLE_FETCH_LIMIT,
      select: { auth0UserId: true, result: true, opponentName: true, createdAt: true },
    }),
    prisma.supportRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: PER_TABLE_FETCH_LIMIT,
      select: { auth0UserId: true, topic: true, createdAt: true },
    }),
  ]);

  const events = [
    ...newTrainers.map((t) => ({
      type: 'trainer_joined',
      auth0UserId: t.auth0UserId,
      detail: t.trainerName,
      createdAt: t.createdAt,
    })),
    ...teamAdditions.map((m) => ({
      type: 'team_member_added',
      auth0UserId: m.auth0UserId,
      detail: m.pokemonName,
      createdAt: m.addedAt,
    })),
    ...battles.map((b) => ({
      type: 'battle_completed',
      auth0UserId: b.auth0UserId,
      detail: `${b.result} vs ${b.opponentName}`,
      createdAt: b.createdAt,
    })),
    ...supportRequests.map((s) => ({
      type: 'support_request_created',
      auth0UserId: s.auth0UserId,
      detail: s.topic,
      createdAt: s.createdAt,
    })),
  ];

  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const top = events.slice(0, RECENT_ACTIVITY_LIMIT);

  // One batched lookup for display names — never one query per event.
  const auth0UserIds = [...new Set(top.map((e) => e.auth0UserId))];
  const profiles = await prisma.trainerProfile.findMany({
    where: { auth0UserId: { in: auth0UserIds } },
    select: { auth0UserId: true, trainerName: true },
  });
  const nameByUserId = new Map(profiles.map((p) => [p.auth0UserId, p.trainerName]));

  return top.map((e) => ({ ...e, trainerName: nameByUserId.get(e.auth0UserId) ?? 'Unknown Trainer' }));
}

// One combined response — the whole point of this function is that the
// client makes exactly one request, not N.
async function getOverview() {
  const [kpis, recentSupportRequests, recentActivity] = await Promise.all([
    getKpis(),
    getRecentSupportRequests(),
    getRecentActivity(),
  ]);

  return { kpis, recentSupportRequests, recentActivity };
}

module.exports = { getOverview };
