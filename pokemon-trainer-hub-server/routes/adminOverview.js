const express = require('express');
const jwtCheck = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const adminOverviewService = require('../services/adminOverviewService');

const router = express.Router();

router.use(jwtCheck, requirePermission('admin:read'));

// GET /api/admin/overview — one combined response (real KPIs, recent
// support requests, recent cross-model activity), not N separate calls.
router.get('/', async (req, res) => {
  const overview = await adminOverviewService.getOverview();
  res.json(overview);
});

module.exports = router;
