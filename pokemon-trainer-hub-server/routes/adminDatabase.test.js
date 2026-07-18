const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/adminDatabase', () => {
  let request;
  let authPayload;
  let adminDatabaseService;

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: authPayload };
          next();
        },
      },
    });

    adminDatabaseService = {
      listTables: mock.fn(async () => []),
      listRecords: mock.fn(async () => ({ results: [], page: 1, pageSize: 20, total: 0 })),
      getRecord: mock.fn(async () => null),
    };
    mock.module(path.resolve(__dirname, '../services/adminDatabaseService.js'), { exports: adminDatabaseService });

    const express = require('express');
    const supertest = require('supertest');
    const adminDatabaseRouter = require('./adminDatabase');

    const app = express();
    app.use(express.json());
    app.use('/api/admin/database', adminDatabaseRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    authPayload = { sub: 'auth0|admin', permissions: ['database:read'] };
    adminDatabaseService.listTables.mock.resetCalls();
    adminDatabaseService.listRecords.mock.resetCalls();
    adminDatabaseService.getRecord.mock.resetCalls();
    adminDatabaseService.listRecords.mock.mockImplementation(async () => ({ results: [], page: 1, pageSize: 20, total: 0 }));
    adminDatabaseService.getRecord.mock.mockImplementation(async () => null);
  });

  test('returns 401 when no token is present', async () => {
    authPayload = undefined;

    const res = await request.get('/api/admin/database/tables');

    assert.equal(res.status, 401);
  });

  test('returns 403 when the token lacks database:read', async () => {
    authPayload = { sub: 'auth0|trainer', permissions: ['admin:read'] };

    const res = await request.get('/api/admin/database/tables');

    assert.equal(res.status, 403);
    assert.equal(adminDatabaseService.listTables.mock.calls.length, 0);
  });

  describe('GET /tables', () => {
    test('returns the real table list', async () => {
      adminDatabaseService.listTables.mock.mockImplementationOnce(async () => [
        { key: 'trainerProfiles', label: 'Trainer Profiles', description: '...', count: 3 },
      ]);

      const res = await request.get('/api/admin/database/tables');

      assert.equal(res.status, 200);
      assert.equal(res.body[0].key, 'trainerProfiles');
    });
  });

  describe('GET /:table', () => {
    test('returns 404 for an unlisted table name — never reaches the service or Prisma', async () => {
      const res = await request.get('/api/admin/database/users');

      assert.equal(res.status, 404);
      assert.equal(adminDatabaseService.listRecords.mock.calls.length, 0);
    });

    test('a real registered table returns the real paginated list', async () => {
      adminDatabaseService.listRecords.mock.mockImplementationOnce(async () => ({
        results: [{ id: 1 }],
        page: 1,
        pageSize: 20,
        total: 1,
      }));

      const res = await request.get('/api/admin/database/trainerProfiles');

      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
    });

    test('rejects a path-traversal / prototype-pollution style table name as 404, not 500', async () => {
      const res = await request.get('/api/admin/database/__proto__');

      assert.equal(res.status, 404);
    });
  });

  describe('GET /:table/:id', () => {
    test('returns 404 for an unlisted table name', async () => {
      const res = await request.get('/api/admin/database/users/1');

      assert.equal(res.status, 404);
      assert.equal(adminDatabaseService.getRecord.mock.calls.length, 0);
    });

    test('returns 404 for a non-numeric id, never passed through to the service', async () => {
      const res = await request.get('/api/admin/database/trainerProfiles/not-a-number');

      assert.equal(res.status, 404);
      assert.equal(adminDatabaseService.getRecord.mock.calls.length, 0);
    });

    test('returns 404 when the record does not exist', async () => {
      const res = await request.get('/api/admin/database/trainerProfiles/999');

      assert.equal(res.status, 404);
    });

    test('returns the real record on success', async () => {
      adminDatabaseService.getRecord.mock.mockImplementationOnce(async () => ({ id: 1, trainerName: 'Ash' }));

      const res = await request.get('/api/admin/database/trainerProfiles/1');

      assert.equal(res.status, 200);
      assert.equal(res.body.trainerName, 'Ash');
      assert.equal(adminDatabaseService.getRecord.mock.calls[0].arguments[1], 1);
    });
  });
});
