const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/adminSupportService', () => {
  let service;
  let prisma;
  let adminAudit;

  function baseRequest(overrides = {}) {
    return {
      id: 1,
      auth0UserId: 'auth0|trainer',
      name: 'Ash',
      email: 'ash@example.com',
      topic: 'Bug report',
      message: 'Something broke',
      status: 'open',
      priority: 'normal',
      adminNotes: null,
      assignedTo: null,
      resolvedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  before(() => {
    prisma = {
      supportRequest: {
        findMany: mock.fn(async () => []),
        count: mock.fn(async () => 0),
        findUnique: mock.fn(async () => baseRequest()),
        update: mock.fn(async ({ where, data }) => ({ ...baseRequest(), ...where, ...data })),
      },
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    adminAudit = { logAdminAction: mock.fn(async () => {}) };
    mock.module(path.resolve(__dirname, './adminAudit.js'), { exports: adminAudit });

    service = require('./adminSupportService');
  });

  function resetAll() {
    prisma.supportRequest.findMany.mock.resetCalls();
    prisma.supportRequest.count.mock.resetCalls();
    prisma.supportRequest.findUnique.mock.resetCalls();
    prisma.supportRequest.update.mock.resetCalls();
    adminAudit.logAdminAction.mock.resetCalls();
  }

  beforeEach(() => {
    resetAll();
    prisma.supportRequest.findMany.mock.mockImplementation(async () => []);
    prisma.supportRequest.count.mock.mockImplementation(async () => 0);
    prisma.supportRequest.findUnique.mock.mockImplementation(async () => baseRequest());
    prisma.supportRequest.update.mock.mockImplementation(async ({ where, data }) => ({
      ...baseRequest(),
      ...where,
      ...data,
    }));
  });

  describe('list', () => {
    test('defaults to page 1, pageSize 20, sorted by createdAt desc', async () => {
      await service.list({});

      const call = prisma.supportRequest.findMany.mock.calls[0].arguments[0];
      assert.equal(call.skip, 0);
      assert.equal(call.take, 20);
      assert.deepEqual(call.orderBy, { createdAt: 'desc' });
    });

    test('caps an excessive pageSize at 100', async () => {
      await service.list({ pageSize: 9999 });

      assert.equal(prisma.supportRequest.findMany.mock.calls[0].arguments[0].take, 100);
    });

    test('ignores a sortBy field that is not on the allowlist', async () => {
      await service.list({ sortBy: 'auth0UserId' });

      assert.deepEqual(prisma.supportRequest.findMany.mock.calls[0].arguments[0].orderBy, {
        createdAt: 'desc',
      });
    });

    test('respects an allowed sortBy/sortDirection', async () => {
      await service.list({ sortBy: 'priority', sortDirection: 'asc' });

      assert.deepEqual(prisma.supportRequest.findMany.mock.calls[0].arguments[0].orderBy, {
        priority: 'asc',
      });
    });

    test('filters by status, priority, topic, and search (name/email)', async () => {
      await service.list({ status: 'open', priority: 'urgent', topic: 'Bug', search: 'ash' });

      const where = prisma.supportRequest.findMany.mock.calls[0].arguments[0].where;
      assert.equal(where.status, 'open');
      assert.equal(where.priority, 'urgent');
      assert.deepEqual(where.topic, { contains: 'Bug' });
      assert.deepEqual(where.OR, [{ name: { contains: 'ash' } }, { email: { contains: 'ash' } }]);
    });

    test('returns the real total alongside the page of results', async () => {
      prisma.supportRequest.count.mock.mockImplementationOnce(async () => 142);
      const result = await service.list({});

      assert.equal(result.total, 142);
      assert.equal(result.page, 1);
      assert.equal(result.pageSize, 20);
    });
  });

  describe('getById', () => {
    test('returns null when not found', async () => {
      prisma.supportRequest.findUnique.mock.mockImplementationOnce(async () => null);
      assert.equal(await service.getById(999), null);
    });
  });

  describe('update', () => {
    test('throws NOT_FOUND when the request does not exist', async () => {
      prisma.supportRequest.findUnique.mock.mockImplementationOnce(async () => null);

      await assert.rejects(service.update(999, { status: 'resolved' }, 'auth0|admin'), (err) => {
        assert.equal(err.code, 'NOT_FOUND');
        return true;
      });
      assert.equal(prisma.supportRequest.update.mock.calls.length, 0);
    });

    test('throws INVALID_STATUS for an unrecognized status value', async () => {
      await assert.rejects(service.update(1, { status: 'closed-forever' }, 'auth0|admin'), (err) => {
        assert.equal(err.code, 'INVALID_STATUS');
        return true;
      });
    });

    test('throws INVALID_PRIORITY for an unrecognized priority value', async () => {
      await assert.rejects(service.update(1, { priority: 'extreme' }, 'auth0|admin'), (err) => {
        assert.equal(err.code, 'INVALID_PRIORITY');
        return true;
      });
    });

    test('never accepts message/name/email/topic — only status/priority/adminNotes/assignedTo reach the DB', async () => {
      await service.update(1, { status: 'in_progress', message: 'hacked', name: 'hacked' }, 'auth0|admin');

      const data = prisma.supportRequest.update.mock.calls[0].arguments[0].data;
      assert.equal(data.message, undefined);
      assert.equal(data.name, undefined);
      assert.equal(data.status, 'in_progress');
    });

    test('sets resolvedAt when status transitions to resolved', async () => {
      await service.update(1, { status: 'resolved' }, 'auth0|admin');

      const data = prisma.supportRequest.update.mock.calls[0].arguments[0].data;
      assert.ok(data.resolvedAt instanceof Date);
    });

    test('clears resolvedAt when status transitions away from resolved', async () => {
      prisma.supportRequest.findUnique.mock.mockImplementationOnce(async () => baseRequest({ status: 'resolved' }));

      await service.update(1, { status: 'open' }, 'auth0|admin');

      const data = prisma.supportRequest.update.mock.calls[0].arguments[0].data;
      assert.equal(data.resolvedAt, null);
    });

    test('logs an audit entry only for status when only status changes', async () => {
      await service.update(1, { status: 'in_progress' }, 'auth0|admin');

      assert.equal(adminAudit.logAdminAction.mock.calls.length, 1);
      assert.equal(adminAudit.logAdminAction.mock.calls[0].arguments[1], 'support.status_changed');
    });

    test('logs both status and priority audit entries when both change', async () => {
      await service.update(1, { status: 'in_progress', priority: 'high' }, 'auth0|admin');

      assert.equal(adminAudit.logAdminAction.mock.calls.length, 2);
      const actions = adminAudit.logAdminAction.mock.calls.map((c) => c.arguments[1]);
      assert.ok(actions.includes('support.status_changed'));
      assert.ok(actions.includes('support.priority_changed'));
    });

    test('logs no audit entry when adminNotes/assignedTo change but status/priority do not', async () => {
      await service.update(1, { adminNotes: 'Called the trainer' }, 'auth0|admin');

      assert.equal(adminAudit.logAdminAction.mock.calls.length, 0);
    });

    test('logs no audit entry when the submitted status/priority equal the existing values', async () => {
      await service.update(1, { status: 'open', priority: 'normal' }, 'auth0|admin');

      assert.equal(adminAudit.logAdminAction.mock.calls.length, 0);
    });
  });
});
