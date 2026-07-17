const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ServiceError = require('../services/serviceError');

describe('routes/adminSupport', () => {
  let request;
  let authPayload;
  let adminSupportService;
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

    adminSupportService = {
      list: mock.fn(async () => ({ results: [], page: 1, pageSize: 20, total: 0 })),
      getById: mock.fn(async () => null),
      update: mock.fn(),
    };
    mock.module(path.resolve(__dirname, '../services/adminSupportService.js'), { exports: adminSupportService });

    adminAudit = { getAuditTrail: mock.fn(async () => []) };
    mock.module(path.resolve(__dirname, '../services/adminAudit.js'), { exports: adminAudit });

    const express = require('express');
    const supertest = require('supertest');
    const adminSupportRouter = require('./adminSupport');

    const app = express();
    app.use(express.json());
    app.use('/api/admin/support', adminSupportRouter);
    request = supertest(app);
  });

  beforeEach(() => {
    authPayload = { sub: 'auth0|admin', permissions: ['support:manage'] };
    adminSupportService.list.mock.resetCalls();
    adminSupportService.getById.mock.resetCalls();
    adminSupportService.update.mock.resetCalls();
    adminAudit.getAuditTrail.mock.resetCalls();
    adminSupportService.list.mock.mockImplementation(async () => ({ results: [], page: 1, pageSize: 20, total: 0 }));
    adminSupportService.getById.mock.mockImplementation(async () => null);
  });

  test('returns 403 when the token lacks support:manage', async () => {
    authPayload = { sub: 'auth0|trainer', permissions: ['admin:read'] };

    const res = await request.get('/api/admin/support');

    assert.equal(res.status, 403);
    assert.equal(adminSupportService.list.mock.calls.length, 0);
  });

  describe('GET /', () => {
    test('returns the real paginated list shape', async () => {
      adminSupportService.list.mock.mockImplementationOnce(async () => ({
        results: [{ id: 1 }],
        page: 1,
        pageSize: 20,
        total: 1,
      }));

      const res = await request.get('/api/admin/support?status=open');

      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
      // req.query is a null-prototype object — spread it into a plain one
      // before comparing, so this only asserts on the values themselves.
      assert.deepEqual({ ...adminSupportService.list.mock.calls[0].arguments[0] }, { status: 'open' });
    });
  });

  describe('GET /:id', () => {
    test('returns 404 when not found', async () => {
      const res = await request.get('/api/admin/support/999');
      assert.equal(res.status, 404);
    });

    test('returns the request enriched with its real audit history', async () => {
      adminSupportService.getById.mock.mockImplementationOnce(async () => ({ id: 1, status: 'open' }));
      adminAudit.getAuditTrail.mock.mockImplementationOnce(async () => [{ id: 1, action: 'support.status_changed' }]);

      const res = await request.get('/api/admin/support/1');

      assert.equal(res.status, 200);
      assert.equal(res.body.id, 1);
      assert.equal(res.body.history.length, 1);
      assert.deepEqual(adminAudit.getAuditTrail.mock.calls[0].arguments, ['SupportRequest', 1]);
    });
  });

  describe('PATCH /:id', () => {
    test('passes the JWT subject (never a client-sent user id) as the acting admin', async () => {
      adminSupportService.update.mock.mockImplementationOnce(async () => ({ id: 1, status: 'resolved' }));

      const res = await request.patch('/api/admin/support/1').send({ status: 'resolved' });

      assert.equal(res.status, 200);
      assert.equal(adminSupportService.update.mock.calls[0].arguments[2], 'auth0|admin');
    });

    test('maps NOT_FOUND to 404', async () => {
      adminSupportService.update.mock.mockImplementationOnce(async () => {
        throw new ServiceError('NOT_FOUND', 'Support request not found.');
      });

      const res = await request.patch('/api/admin/support/999').send({ status: 'open' });
      assert.equal(res.status, 404);
    });

    test('maps INVALID_STATUS to 400', async () => {
      adminSupportService.update.mock.mockImplementationOnce(async () => {
        throw new ServiceError('INVALID_STATUS', 'status must be one of: open, in_progress, resolved.');
      });

      const res = await request.patch('/api/admin/support/1').send({ status: 'bogus' });
      assert.equal(res.status, 400);
    });

    test('maps INVALID_PRIORITY to 400', async () => {
      adminSupportService.update.mock.mockImplementationOnce(async () => {
        throw new ServiceError('INVALID_PRIORITY', 'priority must be one of: low, normal, high, urgent.');
      });

      const res = await request.patch('/api/admin/support/1').send({ priority: 'bogus' });
      assert.equal(res.status, 400);
    });
  });
});
