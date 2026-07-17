const express = require('express');
const jwtCheck = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const adminSupportService = require('../services/adminSupportService');
const { getAuditTrail } = require('../services/adminAudit');
const ServiceError = require('../services/serviceError');

const router = express.Router();

const STATUS_BY_CODE = {
  NOT_FOUND: 404,
  INVALID_STATUS: 400,
  INVALID_PRIORITY: 400,
};

function respondToServiceError(err, res) {
  if (err instanceof ServiceError) {
    const status = STATUS_BY_CODE[err.code] || 500;
    return res.status(status).json({ message: err.message });
  }
  throw err;
}

router.use(jwtCheck, requirePermission('support:manage'));

// GET /api/admin/support — real, server-side pagination/filter/sort.
router.get('/', async (req, res) => {
  const result = await adminSupportService.list(req.query);
  res.json(result);
});

// GET /api/admin/support/:id — includes the real audit trail for the
// drawer's History timeline.
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const request = await adminSupportService.getById(id);
  if (!request) {
    return res.status(404).json({ message: 'Support request not found.' });
  }
  const history = await getAuditTrail('SupportRequest', id);
  res.json({ ...request, history });
});

// PATCH /api/admin/support/:id — only status/priority/adminNotes/assignedTo
// are ever read from the body; the original message/name/email/topic are
// immutable by construction (never even referenced here).
router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { status, priority, adminNotes, assignedTo } = req.body;

  try {
    const updated = await adminSupportService.update(
      id,
      { status, priority, adminNotes, assignedTo },
      req.auth.payload.sub,
    );
    res.json(updated);
  } catch (err) {
    respondToServiceError(err, res);
  }
});

module.exports = router;
