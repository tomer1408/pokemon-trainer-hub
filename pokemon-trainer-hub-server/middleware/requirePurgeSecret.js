const crypto = require('crypto');

// Constant-time string comparison — a plain `===` leaks how many leading
// bytes matched via response timing, which matters here because the secret
// is the *only* thing standing between the internet and a real delete
// operation. Buffer lengths must match before calling timingSafeEqual (it
// throws on a length mismatch), so a length check runs first; that check
// itself doesn't leak anything useful, since the attacker can already see
// the header they sent.
function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Auth model for routes/internal.js — deliberately NOT jwtCheck. The real
// caller (UptimeRobot, or any external scheduler hitting this endpoint) has
// no Auth0 access token, so a shared secret header is the correct
// mechanism here instead. Fails closed if PURGE_SWEEP_SECRET isn't even
// configured (never treats "both sides are undefined" as a match) or if
// the header is missing/wrong — and the response is identical either way,
// so a caller can't learn anything about *why* it failed.
function requirePurgeSecret(req, res, next) {
  const expected = process.env.PURGE_SWEEP_SECRET;
  const provided = req.get('x-purge-secret');

  if (!expected || !provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ message: 'Invalid or missing purge secret.' });
  }

  next();
}

module.exports = requirePurgeSecret;
