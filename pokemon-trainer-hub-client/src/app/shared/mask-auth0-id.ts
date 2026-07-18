// Standing rule across every Admin page: never render a full raw Auth0 user
// id. A "Copy ID" action may still copy the real, unmasked value to the
// clipboard — this only controls what's ever displayed on screen.
export function maskAuth0Id(id: string): string {
  const sepIndex = id.indexOf('|');
  if (sepIndex === -1) {
    return id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-4)}`;
  }

  const prefix = id.slice(0, sepIndex + 1);
  const rest = id.slice(sepIndex + 1);
  return rest.length <= 8 ? `${prefix}${rest}` : `${prefix}${rest.slice(0, 4)}…${rest.slice(-4)}`;
}
