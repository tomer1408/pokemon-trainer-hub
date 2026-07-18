const express = require('express');
const requirePurgeSecret = require('../middleware/requirePurgeSecret');
const { runPurgeSweep } = require('../services/purgeSweepService');
const { createRateLimiter } = require('../services/rateLimiter');

const router = express.Router();

// This route family has no per-caller identity to key on — its one real
// caller is a single external scheduler, not a logged-in trainer — so a
// single fixed key throttles the whole endpoint rather than any one IP.
// Generous enough for the real 5-minute UptimeRobot interval (see README),
// tight enough that repeated requests can't be used to hammer the DB/Auth0
// or to brute-force PURGE_SWEEP_SECRET. Applied before the secret check on
// purpose, so it also caps guessing attempts, not just successful calls.
const PURGE_SWEEP_RATE_LIMIT_KEY = 'purge-sweep';
const purgeSweepRateLimiter = createRateLimiter({ windowSeconds: 60, maxRequests: 5 });

function rateLimitPurgeSweep(req, res, next) {
  if (!purgeSweepRateLimiter.consume(PURGE_SWEEP_RATE_LIMIT_KEY)) {
    return res.status(429).json({ message: 'Too many requests. Please try again shortly.' });
  }
  next();
}

router.use(rateLimitPurgeSweep);
router.use(requirePurgeSecret);

// POST /api/internal/purge-sweep — real, external-scheduler-triggered
// endpoint (see README's "Keeping the free-tier backend warm" section for
// the same UptimeRobot mechanism already used for keep-warm pinging; this
// is a second monitor hitting this endpoint, not an in-process timer —
// this app has no reliable way to run one, per that same section's own
// findings about GitHub Actions' schedule drift). Permanently deletes
// every trainer past their 30-day soft-delete window.
router.post('/purge-sweep', async (req, res) => {
  const result = await runPurgeSweep();
  res.json(result);
});

module.exports = router;
