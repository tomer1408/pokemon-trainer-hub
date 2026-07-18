// Auth model for routes/internal.js — deliberately NOT jwtCheck. The real
// caller (UptimeRobot, or any external scheduler hitting this endpoint) has
// no Auth0 access token, so a shared secret header is the correct
// mechanism here instead. Fails closed if PURGE_SWEEP_SECRET isn't even
// configured (never treats "both sides are undefined" as a match) or if
// the header is missing/wrong.
function requirePurgeSecret(req, res, next) {
  const expected = process.env.PURGE_SWEEP_SECRET;
  const provided = req.get('x-purge-secret');

  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ message: 'Invalid or missing purge secret.' });
  }

  next();
}

module.exports = requirePurgeSecret;
