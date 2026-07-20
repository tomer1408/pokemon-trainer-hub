const prisma = require('./prisma');
const ServiceError = require('./serviceError');

// The complete, strict allowlist (Phase 8 design) — no arbitrary
// client-sent event name is ever accepted. Server-owned events (battle_
// completed, support_request_created, pokemon_added_to_team, ai_request_
// completed/failed) are only ever logged by trusted server code, after the
// real action they describe has already succeeded — never trusted from a
// client request. Client-owned events (the rest) are limited to page/
// session/navigation signals.
const APPROVED_EVENT_TYPES = [
  'session_started',
  'page_viewed',
  'onboarding_completed',
  'starter_quiz_completed',
  'pokemon_added_to_team',
  'dream_team_completed',
  'battle_completed',
  'whos_that_round_completed',
  'ai_request_completed',
  'ai_request_failed',
  'support_request_created',
];

// Real, current app pages worth tracking a view for — not callback/
// onboarding/not-found (technical stops, not product destinations) and not
// the /admin/* tree (a separate, internal audience with its own audit log).
const APPROVED_PAGE_NAMES = [
  'landing',
  'home',
  'explorer',
  'my-team',
  'manage-team',
  'profile',
  'settings',
  'support',
  'ai-trainer-assistant',
  'battle',
  'battle-history',
  'starter-quiz',
  'whos-that-pokemon',
];

// Defensive cap, not a real-world limit — every real caller sends a handful
// of short primitive fields (see the per-event metadata shapes below), so
// anything near this size signals a bug (or a client trying to smuggle a
// payload dump), not a legitimate event.
const MAX_METADATA_JSON_BYTES = 500;

// At most this often per trainer — a coarse recency signal, not an exact
// click log (see schema.prisma's TrainerProfile.lastActiveAt comment).
const LAST_ACTIVE_THROTTLE_MS = 15 * 60 * 1000;

function assertValidEventType(eventType) {
  if (!APPROVED_EVENT_TYPES.includes(eventType)) {
    throw new ServiceError('INVALID_EVENT_TYPE', `eventType must be one of: ${APPROVED_EVENT_TYPES.join(', ')}.`);
  }
}

function assertValidPageName(pageName) {
  if (pageName !== null && pageName !== undefined && !APPROVED_PAGE_NAMES.includes(pageName)) {
    throw new ServiceError('INVALID_PAGE_NAME', `pageName must be one of: ${APPROVED_PAGE_NAMES.join(', ')}.`);
  }
}

function serializeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return null;
  const json = JSON.stringify(metadata);
  if (json.length > MAX_METADATA_JSON_BYTES) {
    throw new ServiceError('METADATA_TOO_LARGE', `metadata must serialize to at most ${MAX_METADATA_JSON_BYTES} bytes.`);
  }
  return json;
}

// The one write path for every AppEvent row, server-owned or client-owned
// alike — eventType/pageName are validated here regardless of caller, so
// there is exactly one place this allowlist is enforced.
async function logEvent({ auth0UserId = null, eventType, pageName = null, metadata = null }) {
  assertValidEventType(eventType);
  assertValidPageName(pageName);
  const metadataJson = serializeMetadata(metadata);

  return prisma.appEvent.create({
    data: { auth0UserId, eventType, pageName, metadataJson },
  });
}

// Throttled — reads the trainer's current lastActiveAt and only writes if
// it's null or older than the throttle window, so a busy session doesn't
// turn this into a write on every single request.
async function updateLastActive(auth0UserId) {
  const profile = await prisma.trainerProfile.findUnique({
    where: { auth0UserId },
    select: { lastActiveAt: true },
  });
  if (!profile) return;

  const now = new Date();
  if (profile.lastActiveAt && now.getTime() - profile.lastActiveAt.getTime() < LAST_ACTIVE_THROTTLE_MS) {
    return;
  }

  await prisma.trainerProfile.update({
    where: { auth0UserId },
    data: { lastActiveAt: now },
  });
}

// Fire-and-forget wrapper for every real call site (routes/services logging
// a server-owned event alongside the real action they describe) — a
// logging failure must never fail or roll back the real action it's
// attached to. logEvent() itself still throws directly for callers (and
// tests) that need to observe validation failures.
async function logEventSafe(params) {
  try {
    await logEvent(params);
  } catch (err) {
    console.error('analyticsEventService: failed to log event:', err.message);
  }
}

module.exports = {
  APPROVED_EVENT_TYPES,
  APPROVED_PAGE_NAMES,
  logEvent,
  logEventSafe,
  updateLastActive,
};
