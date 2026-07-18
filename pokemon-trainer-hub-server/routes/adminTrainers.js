const express = require('express');
const jwtCheck = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const adminTrainerService = require('../services/adminTrainerService');
const { getAuth0User } = require('../services/auth0Management');
const accountService = require('../services/accountService');
const { logAdminAction } = require('../services/adminAudit');

const router = express.Router();

router.use(jwtCheck, requirePermission('users:manage'));

// GET /api/admin/trainers — real, server-side pagination/search/sort.
router.get('/', async (req, res) => {
  const result = await adminTrainerService.list(req.query);
  res.json(result);
});

// GET /api/admin/trainers/:id — :id is a real Auth0 user id (e.g.
// "auth0|64f2..."), url-decoded by Express automatically from the path
// segment.
router.get('/:id', async (req, res) => {
  const detail = await adminTrainerService.getDetail(req.params.id);
  if (!detail) {
    return res.status(404).json({ message: 'Trainer not found.' });
  }
  res.json(detail);
});

// GET /api/admin/trainers/:id/auth0 — a genuine read (correctly a GET, not
// the earlier-mistaken "POST refresh-auth0", which mislabeled a read as a
// mutation). Nothing is persisted; it just returns fresh Auth0 profile data.
router.get('/:id/auth0', async (req, res) => {
  try {
    const auth0User = await getAuth0User(req.params.id);
    res.json(auth0User);
  } catch (err) {
    res.status(502).json({ message: 'Could not reach Auth0 for this trainer.' });
  }
});

// DELETE /api/admin/trainers/:id — soft-deletes an arbitrary trainer
// (services/accountService.js's softDeleteAccount, the same function
// self-service deletion now uses in routes/profile.js — not a second
// deletion path). Auth0 is untouched; the trainer is blocked for 30 days
// and can be restored by an admin (PATCH /:id/restore, added in a later
// phase) or permanently removed early (DELETE /:id/permanent).
router.delete('/:id', async (req, res) => {
  await accountService.softDeleteAccount(req.params.id, {
    deletedBy: req.auth.payload.sub,
    deletionType: 'admin',
  });

  await logAdminAction(req.auth.payload.sub, 'trainer.softDeleted', 'TrainerProfile', req.params.id, {});

  res.status(200).json({
    message: 'This trainer account has been deleted. It can be restored within 30 days.',
  });
});

module.exports = router;
