const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('routes/adminTrainers', () => {
  let request;
  let authPayload;
  let adminTrainerService;
  let auth0Management;
  let accountService;
  let adminAudit;

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: authPayload };
          next();
        },
      },
    });

    adminTrainerService = {
      list: mock.fn(async () => ({ results: [], page: 1, pageSize: 20, total: 0 })),
      getDetail: mock.fn(async () => null),
    };
    mock.module(path.resolve(__dirname, '../services/adminTrainerService.js'), { exports: adminTrainerService });

    auth0Management = { getAuth0User: mock.fn(async () => ({ email: 'ash@example.com' })) };
    mock.module(path.resolve(__dirname, '../services/auth0Management.js'), { exports: auth0Management });

    accountService = { deleteAccount: mock.fn(async () => ({ auth0DeleteFailed: false })) };
    mock.module(path.resolve(__dirname, '../services/accountService.js'), { exports: accountService });

    adminAudit = { logAdminAction: mock.fn(async () => {}) };
    mock.module(path.resolve(__dirname, '../services/adminAudit.js'), { exports: adminAudit });

    const express = require('express');
    const supertest = require('supertest');
    const adminTrainersRouter = require('./adminTrainers');

    const app = express();
    app.use(express.json());
    app.use('/api/admin/trainers', adminTrainersRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    authPayload = { sub: 'auth0|admin', permissions: ['users:manage'] };
    adminTrainerService.list.mock.resetCalls();
    adminTrainerService.getDetail.mock.resetCalls();
    auth0Management.getAuth0User.mock.resetCalls();
    accountService.deleteAccount.mock.resetCalls();
    adminAudit.logAdminAction.mock.resetCalls();
    adminTrainerService.list.mock.mockImplementation(async () => ({ results: [], page: 1, pageSize: 20, total: 0 }));
    adminTrainerService.getDetail.mock.mockImplementation(async () => null);
    auth0Management.getAuth0User.mock.mockImplementation(async () => ({ email: 'ash@example.com' }));
    accountService.deleteAccount.mock.mockImplementation(async () => ({ auth0DeleteFailed: false }));
  });

  test('returns 401 when no token is present', async () => {
    authPayload = undefined;

    const res = await request.get('/api/admin/trainers');

    assert.equal(res.status, 401);
  });

  test('returns 403 when the token lacks users:manage', async () => {
    authPayload = { sub: 'auth0|trainer', permissions: ['admin:read'] };

    const res = await request.get('/api/admin/trainers');

    assert.equal(res.status, 403);
    assert.equal(adminTrainerService.list.mock.calls.length, 0);
  });

  describe('GET /', () => {
    test('returns the real paginated list', async () => {
      adminTrainerService.list.mock.mockImplementationOnce(async () => ({
        results: [{ auth0UserId: 'auth0|a' }],
        page: 1,
        pageSize: 20,
        total: 1,
      }));

      const res = await request.get('/api/admin/trainers');

      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
    });
  });

  describe('GET /:id', () => {
    test('returns 404 when the trainer does not exist', async () => {
      const res = await request.get('/api/admin/trainers/auth0|missing');
      assert.equal(res.status, 404);
    });

    test('returns the real detail, and correctly decodes an id containing "|"', async () => {
      adminTrainerService.getDetail.mock.mockImplementationOnce(async () => ({ profile: { trainerName: 'Ash' } }));

      const res = await request.get('/api/admin/trainers/auth0%7Cabc123');

      assert.equal(res.status, 200);
      assert.equal(adminTrainerService.getDetail.mock.calls[0].arguments[0], 'auth0|abc123');
    });
  });

  describe('GET /:id/auth0', () => {
    test('is a real read — never mutates anything', async () => {
      const res = await request.get('/api/admin/trainers/auth0%7Cabc123/auth0');

      assert.equal(res.status, 200);
      assert.equal(res.body.email, 'ash@example.com');
      assert.equal(accountService.deleteAccount.mock.calls.length, 0);
    });

    test('returns 502 when Auth0 is unreachable, rather than crashing', async () => {
      auth0Management.getAuth0User.mock.mockImplementationOnce(async () => {
        throw new Error('network down');
      });

      const res = await request.get('/api/admin/trainers/auth0%7Cabc123/auth0');

      assert.equal(res.status, 502);
    });
  });

  describe('DELETE /:id', () => {
    test('reuses accountService.deleteAccount — not a new deletion path', async () => {
      const res = await request.delete('/api/admin/trainers/auth0%7Cabc123');

      assert.equal(res.status, 200);
      assert.equal(accountService.deleteAccount.mock.calls[0].arguments[0], 'auth0|abc123');
    });

    test('writes a real audit log entry with the acting admin from the JWT (never client-sent)', async () => {
      await request.delete('/api/admin/trainers/auth0%7Cabc123');

      assert.equal(adminAudit.logAdminAction.mock.calls.length, 1);
      const [adminId, action, targetType, targetId] = adminAudit.logAdminAction.mock.calls[0].arguments;
      assert.equal(adminId, 'auth0|admin');
      assert.equal(action, 'trainer.deleted');
      assert.equal(targetType, 'TrainerProfile');
      assert.equal(targetId, 'auth0|abc123');
    });

    test('includes a warning when the Auth0 side of the deletion failed, same as self-service deletion', async () => {
      accountService.deleteAccount.mock.mockImplementationOnce(async () => ({ auth0DeleteFailed: true }));

      const res = await request.delete('/api/admin/trainers/auth0%7Cabc123');

      assert.equal(res.status, 200);
      assert.ok(res.body.warning);
    });
  });
});
