const express = require('express');
const jwtCheck = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const adminAnalyticsService = require('../services/adminAnalyticsService');

const router = express.Router();

router.use(jwtCheck, requirePermission('admin:read'));

// GET /api/admin/analytics?days=30 — one combined response (real over-time
// buckets, funnel, popularity rankings, battle/support distributions,
// Who's That streak stats). `days` is client-suggestible but server-clamped
// (see adminAnalyticsService.normalizeDays), same convention as
// page/pageSize elsewhere in this app.
router.get('/', async (req, res) => {
  const analytics = await adminAnalyticsService.getAnalytics(req.query.days);
  res.json(analytics);
});

module.exports = router;
