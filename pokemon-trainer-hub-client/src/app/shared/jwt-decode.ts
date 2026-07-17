// Decodes a JWT's payload segment WITHOUT verifying its signature — used
// only for client-side UX (deciding whether to show an Admin nav link/
// route). The real authorization check always happens server-side (see
// middleware/requirePermission.js on the server); this is never trusted as
// the actual gate. Consistent with how auth0-spa-js itself never verifies a
// token's signature client-side either. Returns null on any malformed input
// instead of throwing, so callers never need their own try/catch.
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const segments = token.split('.');
    if (segments.length !== 3) return null;

    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded));

    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
