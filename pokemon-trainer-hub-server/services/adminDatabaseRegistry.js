const { maskAuth0Id } = require('./maskAuth0Id');
const { calculateAgeRange } = require('./ageRange');

const MESSAGE_PREVIEW_LENGTH = 60;

function previewText(text, length = MESSAGE_PREVIEW_LENGTH) {
  if (typeof text !== 'string') return '';
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

// The hardcoded whitelist this whole feature is built around — one entry
// per real Prisma model, nothing invented. `modelName` is looked up on the
// real Prisma client dynamically at query time (never captured as a direct
// reference here), same convention every other admin service already
// follows, so this file stays a pure metadata registry with zero Prisma
// import of its own.
//
// Masking is deliberately stricter than "gated by database:read is
// enough" and applied server-side, in `toSafeRow`/`toSafeDetail` below —
// never left to the client to render safely:
// - `auth0UserId` (or `adminAuth0UserId`) is masked on every table that has one.
// - `TrainerProfile.dateOfBirth`/first/last name are never returned raw — only `ageRange`.
// - `TrainerNote.text` is never returned at all, list or detail.
// - `SupportRequest.message`/`name`/`email` are never returned — only a short message preview + metadata.
const REGISTRY = {
  trainerProfiles: {
    label: 'Trainer Profiles',
    description: 'Registered trainers — profile, preferences, and quiz/streak progress.',
    modelName: 'trainerProfile',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchableFields: ['trainerName', 'country', 'teamName'],
    sortableFields: ['id', 'trainerName', 'country', 'favoriteType', 'experienceLevel', 'createdAt', 'updatedAt'],
    toSafeRow: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      trainerName: row.trainerName,
      country: row.country,
      ageRange: calculateAgeRange(row.dateOfBirth),
      favoriteType: row.favoriteType,
      experienceLevel: row.experienceLevel,
      teamName: row.teamName,
      hasCompletedStarterQuiz: row.hasCompletedStarterQuiz,
      whosThatBestStreak: row.whosThatBestStreak,
      marketingEmailsOptIn: row.marketingEmailsOptIn,
      acceptedPolicy: row.acceptedPolicy,
      policyVersion: row.policyVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  },
  dreamTeamMembers: {
    label: 'Dream Team Members',
    description: "Real Pokémon on each trainer's active Dream Team.",
    modelName: 'dreamTeamMember',
    defaultSort: { field: 'addedAt', direction: 'desc' },
    searchableFields: ['pokemonName'],
    sortableFields: ['id', 'pokemonName', 'position', 'addedAt'],
    toSafeRow: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      pokemonId: row.pokemonId,
      pokemonName: row.pokemonName,
      spriteUrl: row.spriteUrl,
      position: row.position,
      addedAt: row.addedAt,
    }),
  },
  favorites: {
    label: 'Favorites',
    description: "Pokémon trainers have marked as a favorite.",
    modelName: 'favorite',
    defaultSort: { field: 'addedAt', direction: 'desc' },
    searchableFields: ['pokemonName'],
    sortableFields: ['id', 'pokemonName', 'addedAt'],
    toSafeRow: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      pokemonId: row.pokemonId,
      pokemonName: row.pokemonName,
      spriteUrl: row.spriteUrl,
      addedAt: row.addedAt,
    }),
  },
  trainerNotes: {
    label: 'Trainer Notes',
    description: 'Private per-Pokémon notes. Content is never exposed here — only metadata.',
    modelName: 'trainerNote',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchableFields: [],
    sortableFields: ['id', 'createdAt'],
    toSafeRow: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      pokemonId: row.pokemonId,
      textLength: typeof row.text === 'string' ? row.text.length : 0,
      createdAt: row.createdAt,
    }),
  },
  supportRequests: {
    label: 'Support Requests',
    description: 'Contact form submissions. Full message/name/email stay exclusive to the Support Requests page.',
    modelName: 'supportRequest',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchableFields: ['topic'],
    sortableFields: ['id', 'topic', 'status', 'priority', 'createdAt', 'updatedAt'],
    toSafeRow: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      topic: row.topic,
      messagePreview: previewText(row.message),
      status: row.status,
      priority: row.priority,
      assignedTo: row.assignedTo,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  },
  battleMatches: {
    label: 'Battle Matches',
    description: 'Simplified battle simulation results.',
    modelName: 'battleMatch',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchableFields: ['opponentName', 'difficulty', 'opponentType'],
    sortableFields: ['id', 'opponentName', 'difficulty', 'opponentType', 'result', 'createdAt'],
    toSafeRow: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      opponentName: row.opponentName,
      difficulty: row.difficulty,
      rounds: row.rounds,
      roundsPlayed: row.roundsPlayed,
      opponentType: row.opponentType,
      luckFactor: row.luckFactor,
      result: row.result,
      yourWins: row.yourWins,
      oppWins: row.oppWins,
      createdAt: row.createdAt,
    }),
    // Detail view only: the record-details drawer's JSON pretty-printer
    // needs the real roundsJson/teamSnapshotJson blobs — deliberately left
    // out of the list shape above (too large/unwieldy for a table row).
    toSafeDetail: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      opponentName: row.opponentName,
      difficulty: row.difficulty,
      rounds: row.rounds,
      roundsPlayed: row.roundsPlayed,
      opponentType: row.opponentType,
      luckFactor: row.luckFactor,
      result: row.result,
      yourWins: row.yourWins,
      oppWins: row.oppWins,
      roundsJson: row.roundsJson,
      teamSnapshotJson: row.teamSnapshotJson,
      createdAt: row.createdAt,
    }),
  },
  avatarIcons: {
    label: 'Avatar Icons',
    description: 'Curated avatar icon catalog (no per-trainer data — nothing to mask).',
    modelName: 'avatarIcon',
    defaultSort: { field: 'sortOrder', direction: 'asc' },
    searchableFields: ['name', 'category'],
    sortableFields: ['id', 'pokemonId', 'name', 'category', 'sortOrder'],
    toSafeRow: (row) => ({
      id: row.id,
      pokemonId: row.pokemonId,
      name: row.name,
      category: row.category,
      spriteUrl: row.spriteUrl,
      sortOrder: row.sortOrder,
    }),
  },
  appEvents: {
    label: 'App Events',
    description: 'Real product-analytics event log (Phase 8) — powers the Analytics page\'s DAU/MAU/retention/feature-adoption numbers.',
    modelName: 'appEvent',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchableFields: ['eventType', 'pageName'],
    sortableFields: ['id', 'eventType', 'pageName', 'createdAt'],
    toSafeRow: (row) => ({
      id: row.id,
      auth0UserId: maskAuth0Id(row.auth0UserId),
      eventType: row.eventType,
      pageName: row.pageName,
      metadataJson: row.metadataJson,
      createdAt: row.createdAt,
    }),
  },
  adminAuditLogs: {
    label: 'Admin Audit Log',
    description: 'Read-only record of sensitive admin actions.',
    modelName: 'adminAuditLog',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchableFields: ['action', 'targetType'],
    sortableFields: ['id', 'action', 'targetType', 'createdAt'],
    toSafeRow: (row) => ({
      id: row.id,
      adminAuth0UserId: maskAuth0Id(row.adminAuth0UserId),
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      detailsJson: row.detailsJson,
      createdAt: row.createdAt,
    }),
  },
};

function getTableKeys() {
  return Object.keys(REGISTRY);
}

// A plain object literal inherits from Object.prototype, so a naive
// REGISTRY[tableKey] lookup would resolve '__proto__'/'constructor'/
// 'toString' to a real (if useless) object instead of undefined —
// hasOwnProperty guards against treating those as valid registered tables.
function getTableEntry(tableKey) {
  if (typeof tableKey !== 'string' || !Object.prototype.hasOwnProperty.call(REGISTRY, tableKey)) return null;
  return REGISTRY[tableKey];
}

module.exports = { REGISTRY, getTableKeys, getTableEntry };
