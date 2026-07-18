const express = require('express');
const jwtCheck = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const { getTableEntry } = require('../services/adminDatabaseRegistry');
const adminDatabaseService = require('../services/adminDatabaseService');

const router = express.Router();

router.use(jwtCheck, requirePermission('database:read'));

// Hard constraint for this whole router: every route is a GET. No raw SQL,
// no arbitrary Prisma query construction from client input, no
// create/update/delete/truncate — the registry (services/
// adminDatabaseRegistry.js) only ever exposes findMany/count/findUnique
// reads per model; its write methods are never referenced anywhere in this
// file's code path.

// GET /api/admin/database/tables — real per-table counts + metadata.
router.get('/tables', async (req, res) => {
  const tables = await adminDatabaseService.listTables();
  res.json(tables);
});

// GET /api/admin/database/:table — :table is validated against the
// whitelist BEFORE anything reaches Prisma; an unknown name is a plain
// 404, never passed through.
router.get('/:table', async (req, res) => {
  const entry = getTableEntry(req.params.table);
  if (!entry) return res.status(404).json({ message: 'Unknown table.' });

  const records = await adminDatabaseService.listRecords(req.params.table, req.query);
  res.json(records);
});

router.get('/:table/:id', async (req, res) => {
  const entry = getTableEntry(req.params.table);
  if (!entry) return res.status(404).json({ message: 'Unknown table.' });

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(404).json({ message: 'Record not found.' });

  const record = await adminDatabaseService.getRecord(req.params.table, id);
  if (!record) return res.status(404).json({ message: 'Record not found.' });

  res.json(record);
});

module.exports = router;
