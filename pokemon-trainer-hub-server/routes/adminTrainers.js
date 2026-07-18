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

// DELETE /api/admin/trainers/:id — reuses the EXISTING self-service deletion
// logic (services/accountService.js) for an admin-initiated deletion of an
// arbitrary trainer, not a second deletion path. Audit-logged regardless of
// whether the Auth0 side succeeds, since the DB half (the part that's
// guaranteed) always completes if this responds successfully.
router.delete('/:id', async (req, res) => {
  const { auth0DeleteFailed } = await accountService.deleteAccount(req.params.id);

  await logAdminAction(req.auth.payload.sub, 'trainer.deleted', 'TrainerProfile', req.params.id, {
    auth0DeleteFailed,
  });

  res.status(200).json({
    message: 'This trainer account and all their data have been deleted.',
    ...(auth0DeleteFailed && {
      warning: 'Their data was deleted, but there was an issue fully closing their login.',
    }),
  });
});

module.exports = router;
