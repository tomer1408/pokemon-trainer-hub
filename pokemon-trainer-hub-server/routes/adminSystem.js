const express = require('express');
const jwtCheck = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const adminHealthService = require('../services/adminHealthService');

const router = express.Router();

router.use(jwtCheck, requirePermission('admin:read'));

// GET /api/admin/system — real runtime info, real dependency checks
// (Database + PokeAPI actually pinged, Gemini/Sentry reported as
// configured/not_configured from env var presence), and real build info.
router.get('/', async (req, res) => {
  const health = await adminHealthService.getSystemHealth();
  res.json(health);
});

module.exports = router;
