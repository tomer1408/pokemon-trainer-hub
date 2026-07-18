const express = require('express');
const requirePurgeSecret = require('../middleware/requirePurgeSecret');
const { runPurgeSweep } = require('../services/purgeSweepService');

const router = express.Router();

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
