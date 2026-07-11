const MAX_NAME_LENGTH = 40;

const VALID_STYLES = ['Epic', 'Competitive', 'Mysterious', 'Cute', 'Funny'];

const STYLE_WORDS = {
  Epic: ['Legends', 'Vanguard', 'Titans'],
  Competitive: ['Elite', 'Force', 'Squad'],
  Mysterious: ['Eclipse', 'Phantoms', 'Veil'],
  Cute: ['Sparkles', 'Pals', 'Dreamers'],
  Funny: ['Chaos Crew', 'Snack Squad', 'Oops Team'],
};

function mostCommonType(team) {
  const counts = new Map();
  for (const member of team) {
    for (const type of member.types) counts.set(type, (counts.get(type) || 0) + 1);
  }

  let best = null;
  let bestCount = 0;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

function strongestType(team) {
  if (team.length === 0) return null;
  const strongest = team.reduce((a, b) => (b.baseExperience > a.baseExperience ? b : a));
  return strongest.types[0] ?? null;
}

// Deterministic, no AI involved — used whenever Gemini's output can't be
// trusted (error, timeout, quota, invalid/duplicate names), so the feature
// always returns exactly 3 usable suggestions.
function buildFallbackNames(team, style) {
  const words = STYLE_WORDS[style] || STYLE_WORDS.Epic;
  const type = mostCommonType(team) || strongestType(team) || 'Pokémon';
  const label = type.charAt(0).toUpperCase() + type.slice(1);

  return [`${label} ${words[0]}`, `${words[1]} of ${label}`, `${label} ${words[2]}`];
}

// Trims, drops empty/over-length/duplicate (case-insensitive) entries.
// Returns null instead of a short array if fewer than 3 valid names
// survive, so callers know to fall back rather than show 1-2 suggestions.
function sanitizeNames(rawNames) {
  if (!Array.isArray(rawNames)) return null;

  const seen = new Set();
  const clean = [];
  for (const raw of rawNames) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_NAME_LENGTH) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(trimmed);
  }
  return clean.length >= 3 ? clean.slice(0, 3) : null;
}

// Shared by PATCH /api/profile/team-name — validates a name a client wants
// to save, regardless of whether it came from a free-typed field or an AI
// suggestion (an AI-generated string is not trusted just because of where
// it came from). Returns { ok: true, name } or { ok: false, message }.
function validateTeamNameValue(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  // eslint-disable-next-line no-control-regex
  const hasControlChars = /[\x00-\x1f\x7f]/.test(name);

  if (!name || name.length < 2 || name.length > MAX_NAME_LENGTH || hasControlChars) {
    return { ok: false, message: 'Team name must be 2-40 characters with no control characters.' };
  }
  return { ok: true, name };
}

module.exports = {
  VALID_STYLES,
  STYLE_WORDS,
  MAX_NAME_LENGTH,
  buildFallbackNames,
  sanitizeNames,
  validateTeamNameValue,
};
