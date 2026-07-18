// Server-side port of the client's shared/mask-auth0-id.ts — same
// algorithm, kept in sync deliberately. The Database Explorer (Phase 6) is
// the one place in this app where masking must happen server-side, before
// the response ever leaves the API, rather than left to the client to
// render safely (a stricter rule than Phase 2's Trainers page, appropriate
// here since this is a generic, higher-exposure raw-table browser).
function maskAuth0Id(id) {
  if (typeof id !== 'string' || id.length === 0) return id;

  const sepIndex = id.indexOf('|');
  if (sepIndex === -1) {
    return id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-4)}`;
  }

  const prefix = id.slice(0, sepIndex + 1);
  const rest = id.slice(sepIndex + 1);
  return rest.length <= 8 ? `${prefix}${rest}` : `${prefix}${rest.slice(0, 4)}…${rest.slice(-4)}`;
}

module.exports = { maskAuth0Id };
