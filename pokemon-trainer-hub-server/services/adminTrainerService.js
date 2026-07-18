const prisma = require('./prisma');
const { getTeam } = require('./teamService');
const { calculateAgeRange } = require('./ageRange');

const SORTABLE_FIELDS = ['createdAt', 'trainerName', 'country'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function clampPageSize(pageSize) {
  const n = parseInt(pageSize, 10);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

function normalizePage(page) {
  const n = parseInt(page, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

// Counts DreamTeamMember/Favorite/BattleMatch rows for a set of trainers in
// exactly 3 queries total (not one per trainer) — there's no relation to
// join on (each table just carries its own plain auth0UserId column, see
// schema.prisma's own comments), so this is done as scoped groupBy calls
// merged in JS rather than a Prisma relational include.
async function countsByAuth0UserId(auth0UserIds) {
  const [teamCounts, favoriteCounts, battleCounts] = await Promise.all([
    prisma.dreamTeamMember.groupBy({ by: ['auth0UserId'], where: { auth0UserId: { in: auth0UserIds } }, _count: { _all: true } }),
    prisma.favorite.groupBy({ by: ['auth0UserId'], where: { auth0UserId: { in: auth0UserIds } }, _count: { _all: true } }),
    prisma.battleMatch.groupBy({ by: ['auth0UserId'], where: { auth0UserId: { in: auth0UserIds } }, _count: { _all: true } }),
  ]);

  const toMap = (rows) => new Map(rows.map((r) => [r.auth0UserId, r._count._all]));
  const teamMap = toMap(teamCounts);
  const favoriteMap = toMap(favoriteCounts);
  const battleMap = toMap(battleCounts);

  return (auth0UserId) => ({
    teamSize: teamMap.get(auth0UserId) ?? 0,
    favoritesCount: favoriteMap.get(auth0UserId) ?? 0,
    battleCount: battleMap.get(auth0UserId) ?? 0,
  });
}

// Real, server-side pagination/search/sort — same discipline already
// established in adminSupportService.js. No email here: TrainerProfile
// never stores it (Auth0 is the sole source of truth for it, see
// schema.prisma's own comments) — fetching it per row would mean one
// Management API call per trainer on every page load, too expensive for a
// list view. It's available on demand via getAuth0User() on the detail page.
async function list(filters = {}) {
  const page = normalizePage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);
  const sortBy = SORTABLE_FIELDS.includes(filters.sortBy) ? filters.sortBy : 'createdAt';
  const sortDirection = filters.sortDirection === 'asc' ? 'asc' : 'desc';

  const where = {};
  if (filters.search) where.trainerName = { contains: filters.search };
  if (filters.country) where.country = filters.country;
  if (filters.hasCompletedStarterQuiz !== undefined) {
    where.hasCompletedStarterQuiz = filters.hasCompletedStarterQuiz === 'true' || filters.hasCompletedStarterQuiz === true;
  }

  const [profiles, total] = await Promise.all([
    prisma.trainerProfile.findMany({
      where,
      orderBy: { [sortBy]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.trainerProfile.count({ where }),
  ]);

  const countsFor = await countsByAuth0UserId(profiles.map((p) => p.auth0UserId));

  const results = profiles.map((p) => ({
    auth0UserId: p.auth0UserId,
    trainerName: p.trainerName,
    country: p.country,
    ageRange: calculateAgeRange(new Date(p.dateOfBirth)),
    favoriteType: p.favoriteType,
    hasCompletedStarterQuiz: p.hasCompletedStarterQuiz,
    createdAt: p.createdAt,
    ...countsFor(p.auth0UserId),
  }));

  return { results, page, pageSize, total };
}

// Full detail for one trainer — reuses teamService.getTeam() (not
// reimplemented) for the real, PokeAPI-enriched Dream Team. Deliberately
// excludes TrainerNote content (private by design, same standing rule as
// the Database Explorer later). Returns null if no profile exists.
async function getDetail(auth0UserId) {
  const profile = await prisma.trainerProfile.findUnique({ where: { auth0UserId } });
  if (!profile) return null;

  const [team, favoritesCount, battles, supportRequests] = await Promise.all([
    getTeam(auth0UserId),
    prisma.favorite.count({ where: { auth0UserId } }),
    prisma.battleMatch.findMany({ where: { auth0UserId }, orderBy: { createdAt: 'desc' } }),
    prisma.supportRequest.findMany({
      where: { auth0UserId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, topic: true, status: true, priority: true, createdAt: true },
    }),
  ]);

  const wins = battles.filter((b) => b.result === 'win').length;
  const losses = battles.filter((b) => b.result === 'loss').length;
  const difficultyBreakdown = {};
  for (const b of battles) {
    difficultyBreakdown[b.difficulty] = (difficultyBreakdown[b.difficulty] ?? 0) + 1;
  }

  return {
    profile: {
      auth0UserId: profile.auth0UserId,
      trainerName: profile.trainerName,
      country: profile.country,
      ageRange: calculateAgeRange(new Date(profile.dateOfBirth)),
      favoriteType: profile.favoriteType,
      experienceLevel: profile.experienceLevel,
      teamName: profile.teamName,
      marketingEmailsOptIn: profile.marketingEmailsOptIn,
      acceptedPolicy: profile.acceptedPolicy,
      acceptedPolicyAt: profile.acceptedPolicyAt,
      policyVersion: profile.policyVersion,
      hasCompletedStarterQuiz: profile.hasCompletedStarterQuiz,
      whosThatBestStreak: profile.whosThatBestStreak,
      createdAt: profile.createdAt,
    },
    team,
    favoritesCount,
    battles: {
      total: battles.length,
      wins,
      losses,
      difficultyBreakdown,
      recent: battles.slice(0, 10).map((b) => ({
        id: b.id,
        opponentName: b.opponentName,
        difficulty: b.difficulty,
        result: b.result,
        yourWins: b.yourWins,
        oppWins: b.oppWins,
        createdAt: b.createdAt,
      })),
    },
    supportRequests,
  };
}

module.exports = { list, getDetail };
