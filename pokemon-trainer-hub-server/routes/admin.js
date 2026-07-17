const express = require('express');
const jwtCheck = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

const router = express.Router();

// Phase 0 smoke route — proves the full chain (valid JWT -> real
// `permissions` claim -> requirePermission) works end to end before any
// real Admin business endpoint is built. Every future /api/admin/* route
// follows this exact jwtCheck + requirePermission shape.
router.get('/ping', jwtCheck, requirePermission('admin:read'), (req, res) => {
  res.json({ status: 'ok', message: 'Admin API reachable.' });
});

module.exports = router;
