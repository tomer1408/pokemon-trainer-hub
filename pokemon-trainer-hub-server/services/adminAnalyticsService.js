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
    prisma.trainerProfile.findMany({ where: { deletedAt: null, createdAt: { gte: since } }, select: { createdAt: true } }),
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
    prisma.trainerProfile.count({ where: { deletedAt: null } }),
    prisma.trainerProfile.count({ where: { deletedAt: null, hasCompletedStarterQuiz: true } }),
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
    prisma.trainerProfile.aggregate({
      where: { deletedAt: null },
      _avg: { whosThatBestStreak: true },
      _max: { whosThatBestStreak: true },
    }),
    prisma.trainerProfile.count({ where: { deletedAt: null, whosThatBestStreak: { gt: 0 } } }),
  ]);

  return {
    averageBestStreak: Math.round((aggregate._avg.whosThatBestStreak ?? 0) * 10) / 10,
    highestBestStreak: aggregate._max.whosThatBestStreak ?? 0,
    trainersWhoHavePlayed: playedCount,
  };
}

// Per Phase 8's approved event registry — the subset that represents a real
// "used this feature" signal, distinct from page_viewed/session_started
// (their own dedicated over-time series below) and ai_request_failed (its
// own success-rate breakdown below).
const FEATURE_ADOPTION_EVENT_TYPES = [
  'onboarding_completed',
  'starter_quiz_completed',
  'pokemon_added_to_team',
  'dream_team_completed',
  'battle_completed',
  'whos_that_round_completed',
  'support_request_created',
  'ai_request_completed',
];

// Every engagement/retention number below derives from this one fetch —
// simpler to reason about (and to test) than several separately-shaped
// queries, and consistent with getOverTime's own "fetch once, bucket in JS"
// approach above. Real, current-scale tradeoff, not an oversight: this app
// has no realistic near-term volume that would make one unbounded AppEvent
// scan expensive.
async function getAllEvents() {
  return prisma.appEvent.findMany({
    select: { auth0UserId: true, eventType: true, createdAt: true, metadataJson: true },
  });
}

// DAU/MAU (Phase 8's own definitions: unique authenticated users with ≥1
// approved activity event on a calendar day / in the last 30 days),
// page-view and session-start over-time series (reusing bucketByDay, same
// as the profile/battle series above), real per-feature adoption counts,
// and real AI success/failure rates parsed from each event's own metadata.
// Everything here reads exclusively from AppEvent — a table that's only
// existed since Phase 8 shipped, so these numbers are honestly small/zero
// until real usage accumulates from that point on, never backfilled or
// estimated from older data (see the Phase 8 design's own documented
// retention/DAU limitation).
function computeEngagementStats(events, since, days) {
  const startOfToday = daysAgo(0);
  const startOfMauWindow = daysAgo(29);

  const dauUsers = new Set();
  const mauUsers = new Set();
  const pageViewTimestamps = [];
  const sessionTimestamps = [];
  const featureCountByType = new Map();
  const aiStatsByFeature = new Map();

  for (const e of events) {
    if (e.auth0UserId) {
      if (e.createdAt >= startOfToday) dauUsers.add(e.auth0UserId);
      if (e.createdAt >= startOfMauWindow) mauUsers.add(e.auth0UserId);
    }
    if (e.eventType === 'page_viewed' && e.createdAt >= since) pageViewTimestamps.push(e.createdAt);
    if (e.eventType === 'session_started' && e.createdAt >= since) sessionTimestamps.push(e.createdAt);
    if (FEATURE_ADOPTION_EVENT_TYPES.includes(e.eventType)) {
      featureCountByType.set(e.eventType, (featureCountByType.get(e.eventType) ?? 0) + 1);
    }
    if (e.eventType === 'ai_request_completed' || e.eventType === 'ai_request_failed') {
      let feature = 'unknown';
      try {
        feature = JSON.parse(e.metadataJson ?? '{}').feature ?? 'unknown';
      } catch {
        // A malformed metadataJson can never happen from a real logEvent()
        // call (it always serializes what it's given) — this only guards
        // against a corrupted row, so it's counted as 'unknown' rather
        // than crashing the whole Analytics page over one bad record.
      }
      const entry = aiStatsByFeature.get(feature) ?? { feature, completed: 0, failed: 0 };
      if (e.eventType === 'ai_request_completed') entry.completed += 1;
      else entry.failed += 1;
      aiStatsByFeature.set(feature, entry);
    }
  }

  const featureAdoption = FEATURE_ADOPTION_EVENT_TYPES.map((eventType) => ({
    label: eventType,
    count: featureCountByType.get(eventType) ?? 0,
  }));

  const aiRequestStats = [...aiStatsByFeature.values()].map((entry) => ({
    ...entry,
    successRatePct:
      entry.completed + entry.failed > 0
        ? Math.round((entry.completed / (entry.completed + entry.failed)) * 1000) / 10
        : null,
  }));

  return {
    dau: dauUsers.size,
    mau: mauUsers.size,
    pageViewsOverTime: bucketByDay(pageViewTimestamps, since, days),
    sessionsOverTime: bucketByDay(sessionTimestamps, since, days),
    featureAdoption,
    aiRequestStats,
  };
}

// Real Day-1/7/30 cohort retention: for every trainer whose EARLIEST-ever
// AppEvent falls on some day D, what fraction of them logged another
// approved event on exactly day D+N. A trainer only counts toward
// `eligible` once D+N has actually passed — never estimated or
// extrapolated for a cohort still mid-window. Because AppEvent only exists
// since this phase shipped, every number here is honestly 0/null at first
// and only becomes meaningful as real days of usage accumulate — exactly
// the limitation the Phase 8 design document itself calls out, not an
// omission. Deliberately takes the same already-fetched `events` array as
// computeEngagementStats above — one query serves both.
function computeRetention(events) {
  const eventDaysByUser = new Map();
  for (const { auth0UserId, createdAt } of events) {
    if (!auth0UserId) continue;
    const key = dateKey(createdAt);
    if (!eventDaysByUser.has(auth0UserId)) eventDaysByUser.set(auth0UserId, new Set());
    eventDaysByUser.get(auth0UserId).add(key);
  }

  const firstDayByUser = new Map();
  for (const [user, days] of eventDaysByUser) {
    firstDayByUser.set(user, [...days].sort()[0]);
  }

  function retentionForOffset(offsetDays) {
    let eligible = 0;
    let retained = 0;
    const now = Date.now();
    for (const [user, firstDay] of firstDayByUser) {
      const firstDate = new Date(`${firstDay}T00:00:00.000Z`);
      const targetDate = new Date(firstDate.getTime() + offsetDays * ONE_DAY_MS);
      if (targetDate.getTime() > now) continue;
      eligible += 1;
      if (eventDaysByUser.get(user).has(dateKey(targetDate))) retained += 1;
    }
    return {
      eligible,
      retained,
      ratePct: eligible > 0 ? Math.round((retained / eligible) * 1000) / 10 : null,
    };
  }

  return {
    day1: retentionForOffset(1),
    day7: retentionForOffset(7),
    day30: retentionForOffset(30),
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

  const [overTime, funnel, popularPokemon, battleStats, whosThatStats, supportStats, events] = await Promise.all([
    getOverTime(since, normalizedDays),
    getFunnel(),
    getPopularPokemon(),
    getBattleStats(),
    getWhosThatStats(),
    getSupportStats(),
    getAllEvents(),
  ]);

  const engagement = computeEngagementStats(events, since, normalizedDays);
  const retention = computeRetention(events);

  return {
    days: normalizedDays,
    overTime,
    funnel,
    popularPokemon,
    battleStats,
    whosThatStats,
    supportStats,
    engagement,
    retention,
  };
}

module.exports = { getAnalytics, normalizeDays, computeEngagementStats, computeRetention };
