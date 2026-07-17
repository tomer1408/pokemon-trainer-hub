// Real Auth0-permission authorization for /api/admin/* routes — a valid JWT
// alone (jwtCheck) is not enough; the token's own `permissions` array
// (Auth0's standard RBAC claim, present once RBAC + "Add Permissions in the
// Access Token" are enabled on the API) must contain the specific permission
// a route requires.
//
// Defensive by construction: does NOT assume jwtCheck ran correctly upstream
// on every call site. If req.auth?.payload is missing, this responds 401
// itself instead of throwing or silently letting the request through — a
// route file that forgot to mount jwtCheck first fails closed, not open.
function requirePermission(permission) {
  return (req, res, next) => {
    const payload = req.auth?.payload;
    if (!payload) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // A missing or malformed `permissions` claim defaults to "no
    // permissions" rather than throwing — a bad/absent claim shape fails
    // closed, the same way an empty array would.
    const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({ message: `Missing required permission: ${permission}.` });
    }

    next();
  };
}

module.exports = requirePermission;
