const prisma = require('./prisma');

const DEFAULT_DAYS = 30;
const MIN_DAYS = 7;
const MAX_DAYS = 180;
const POPULAR_LIMIT = 8;
const DISTRIBUTION_LIMIT = 10;

// Client-suggestible but server-clamped — same convention as pageSize
// elsewhere in this app (e.g. adminSupportService's MAX_PAGE_SIZE).
function normalizeDays(days) {
  const n = Number.isInteger(days) ? days : parseInt(days, 10);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_DAYS;
  return Math.min(Math.max(n, MIN_DAYS), MAX_DAYS);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Anchored to UTC midnight (not local time) so bucket boundaries always
// line up with dateKey's UTC-based toISOString() slicing below, regardless
// of the server's local timezone — a local-time anchor (setDate/getHours)
// would silently shift events into the wrong day near midnight in any
// timezone with a non-zero UTC offset.
function daysAgo(n) {
  const now = new Date();
  const utcMidnightToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(utcMidnightToday - n * ONE_DAY_MS);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// Buckets real timestamps into a dense (no missing days), zero-filled daily
// series in JS — this app's realistic data volume makes raw-SQL date
// truncation unnecessary (a documented scale tradeoff, not an oversight).
function bucketByDay(timestamps, since, days) {
  const counts = new Map();
  for (let i = 0; i < days; i++) {
    counts.set(dateKey(new Date(since.getTime() + i * ONE_DAY_MS)), 0);
  }
  for (const ts of timestamps) {
    const key = dateKey(new Date(ts));
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

async function getOverTime(since, days) {
  const [profiles, battles] = await Promise.all([
    prisma.trainerProfile.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.battleMatch.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);

  const profileSeries = bucketByDay(profiles.map((p) => p.createdAt), since, days);
  const battleSeries = bucketByDay(battles.map((b) => b.createdAt), since, days);

  return {
    profiles: profileSeries,
    battles: battleSeries,
  };
}

// Real sequential counts, profile -> first battle, exactly as the mockup's
// "Activation Funnel" describes it. Team-size steps reuse the same groupBy
// technique already used in adminOverviewService/adminTrainerService — no
// relation exists to join on, so per-trainer counts come from groupBy, not
// a flat .count().
async function getFunnel() {
  const [totalProfiles, quizCompleted, teamGroups, battleGroups] = await Promise.all([
    prisma.trainerProfile.count(),
    prisma.trainerProfile.count({ where: { hasCompletedStarterQuiz: true } }),
    prisma.dreamTeamMember.groupBy({ by: ['auth0UserId'], _count: { _all: true } }),
    prisma.battleMatch.groupBy({ by: ['auth0UserId'], _count: { _all: true } }),
  ]);

  const hasTeamCount = teamGroups.length;
  const fullTeamCount = teamGroups.filter((g) => g._count._all === 5).length;
  const battledCount = battleGroups.length;

  return [
    { step: 'Trainer Profile Created', count: totalProfiles },
    { step: 'Completed Starter Quiz', count: quizCompleted },
    { step: 'Added ≥1 Team Member', count: hasTeamCount },
    { step: 'Completed Full Team (5/5)', count: fullTeamCount },
    { step: 'Fought ≥1 Battle', count: battledCount },
  ];
}

async function getPopularPokemon() {
  const [teamGroups, favoriteGroups] = await Promise.all([
    prisma.dreamTeamMember.groupBy({
      by: ['pokemonId', 'pokemonName'],
      _count: { _all: true },
      orderBy: { _count: { pokemonId: 'desc' } },
      take: POPULAR_LIMIT,
    }),
    prisma.favorite.groupBy({
      by: ['pokemonId', 'pokemonName'],
      _count: { _all: true },
      orderBy: { _count: { pokemonId: 'desc' } },
      take: POPULAR_LIMIT,
    }),
  ]);

  const toEntries = (groups) =>
    groups.map((g) => ({ pokemonId: g.pokemonId, pokemonName: g.pokemonName, count: g._count._all }));

  return {
    inTeams: toEntries(teamGroups),
    favorited: toEntries(favoriteGroups),
  };
}

async function getBattleStats() {
  const [resultGroups, difficultyGroups, opponentTypeGroups] = await Promise.all([
    prisma.battleMatch.groupBy({ by: ['result'], _count: { _all: true } }),
    prisma.battleMatch.groupBy({ by: ['difficulty'], _count: { _all: true }, orderBy: { _count: { difficulty: 'desc' } }, take: DISTRIBUTION_LIMIT }),
    prisma.battleMatch.groupBy({ by: ['opponentType'], _count: { _all: true }, orderBy: { _count: { opponentType: 'desc' } }, take: DISTRIBUTION_LIMIT }),
  ]);

  const toEntries = (groups, keyField) => groups.map((g) => ({ label: g[keyField], count: g._count._all }));

  return {
    results: toEntries(resultGroups, 'result'),
    byDifficulty: toEntries(difficultyGroups, 'difficulty'),
    byOpponentType: toEntries(opponentTypeGroups, 'opponentType'),
  };
}

// Only ever aggregates a real, already-tracked field
// (TrainerProfile.whosThatBestStreak) — never invents per-round history
// this app doesn't store.
async function getWhosThatStats() {
  const [aggregate, playedCount] = await Promise.all([
    prisma.trainerProfile.aggregate({ _avg: { whosThatBestStreak: true }, _max: { whosThatBestStreak: true } }),
    prisma.trainerProfile.count({ where: { whosThatBestStreak: { gt: 0 } } }),
  ]);

  return {
    averageBestStreak: Math.round((aggregate._avg.whosThatBestStreak ?? 0) * 10) / 10,
    highestBestStreak: aggregate._max.whosThatBestStreak ?? 0,
    trainersWhoHavePlayed: playedCount,
  };
}

async function getSupportStats() {
  const [topicGroups, statusGroups] = await Promise.all([
    prisma.supportRequest.groupBy({ by: ['topic'], _count: { _all: true }, orderBy: { _count: { topic: 'desc' } }, take: DISTRIBUTION_LIMIT }),
    prisma.supportRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const toEntries = (groups, keyField) => groups.map((g) => ({ label: g[keyField], count: g._count._all }));

  return {
    byTopic: toEntries(topicGroups, 'topic'),
    byStatus: toEntries(statusGroups, 'status'),
  };
}

// One combined response for one client request — same convention as
// adminOverviewService.getOverview(). `days` controls only the over-time
// bucketing window; every other section (funnel, distributions, streaks)
// reflects all-time real data, matching the mockup's own funnel/legend
// scope.
async function getAnalytics(days) {
  const normalizedDays = normalizeDays(days);
  const since = daysAgo(normalizedDays - 1);

  const [overTime, funnel, popularPokemon, battleStats, whosThatStats, supportStats] = await Promise.all([
    getOverTime(since, normalizedDays),
    getFunnel(),
    getPopularPokemon(),
    getBattleStats(),
    getWhosThatStats(),
    getSupportStats(),
  ]);

  return { days: normalizedDays, overTime, funnel, popularPokemon, battleStats, whosThatStats, supportStats };
}

module.exports = { getAnalytics, normalizeDays };
