const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('services/analyticsEventService', () => {
  let service;
  let prisma;

  before(() => {
    prisma = {
      appEvent: { create: mock.fn(async ({ data }) => ({ id: 1, ...data, createdAt: new Date() })) },
      trainerProfile: {
        findUnique: mock.fn(async () => ({ lastActiveAt: null })),
        update: mock.fn(async ({ data }) => ({ ...data })),
      },
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    service = require('./analyticsEventService');
  });

  beforeEach(() => {
    prisma.appEvent.create.mock.resetCalls();
    prisma.appEvent.create.mock.mockImplementation(async ({ data }) => ({ id: 1, ...data, createdAt: new Date() }));
    prisma.trainerProfile.findUnique.mock.resetCalls();
    prisma.trainerProfile.findUnique.mock.mockImplementation(async () => ({ lastActiveAt: null }));
    prisma.trainerProfile.update.mock.resetCalls();
    prisma.trainerProfile.update.mock.mockImplementation(async ({ data }) => ({ ...data }));
  });

  describe('logEvent', () => {
    test('rejects an event type not on the approved allowlist, before ever touching the database', async () => {
      await assert.rejects(
        service.logEvent({ eventType: 'made_up_event' }),
        (err) => err.code === 'INVALID_EVENT_TYPE',
      );
      assert.equal(prisma.appEvent.create.mock.calls.length, 0);
    });

    test('accepts every real approved event type', async () => {
      for (const eventType of service.APPROVED_EVENT_TYPES) {
        await service.logEvent({ eventType });
      }
      assert.equal(prisma.appEvent.create.mock.calls.length, service.APPROVED_EVENT_TYPES.length);
    });

    test('rejects a page name not on the approved allowlist', async () => {
      await assert.rejects(
        service.logEvent({ eventType: 'page_viewed', pageName: '/admin/database' }),
        (err) => err.code === 'INVALID_PAGE_NAME',
      );
      assert.equal(prisma.appEvent.create.mock.calls.length, 0);
    });

    test('a null/omitted page name is fine — only a real, wrong value is rejected', async () => {
      await service.logEvent({ eventType: 'session_started' });
      assert.equal(prisma.appEvent.create.mock.calls.length, 1);
    });

    test('persists auth0UserId, eventType, pageName, and serialized metadata exactly as given', async () => {
      await service.logEvent({
        auth0UserId: 'auth0|abc',
        eventType: 'battle_completed',
        metadata: { difficulty: 'hard', result: 'win' },
      });

      const data = prisma.appEvent.create.mock.calls[0].arguments[0].data;
      assert.equal(data.auth0UserId, 'auth0|abc');
      assert.equal(data.eventType, 'battle_completed');
      assert.equal(data.pageName, null);
      assert.equal(data.metadataJson, '{"difficulty":"hard","result":"win"}');
    });

    test('defaults auth0UserId to null when omitted (a session_started before onboarding has no profile yet)', async () => {
      await service.logEvent({ eventType: 'session_started' });
      assert.equal(prisma.appEvent.create.mock.calls[0].arguments[0].data.auth0UserId, null);
    });

    test('rejects metadata that serializes larger than the size cap, before touching the database', async () => {
      const hugeMetadata = { dump: 'x'.repeat(1000) };

      await assert.rejects(
        service.logEvent({ eventType: 'battle_completed', metadata: hugeMetadata }),
        (err) => err.code === 'METADATA_TOO_LARGE',
      );
      assert.equal(prisma.appEvent.create.mock.calls.length, 0);
    });
  });

  describe('logEventSafe', () => {
    test('logs and swallows a failure instead of throwing — the caller\'s real action must never be blocked by analytics', async () => {
      prisma.appEvent.create.mock.mockImplementationOnce(async () => {
        throw new Error('DB is down');
      });

      await assert.doesNotReject(service.logEventSafe({ eventType: 'battle_completed' }));
    });

    test('still writes the real event when nothing fails', async () => {
      await service.logEventSafe({ eventType: 'battle_completed' });
      assert.equal(prisma.appEvent.create.mock.calls.length, 1);
    });
  });

  describe('updateLastActive', () => {
    test('does nothing when the trainer has no profile row', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => null);

      await service.updateLastActive('auth0|no-profile');

      assert.equal(prisma.trainerProfile.update.mock.calls.length, 0);
    });

    test('writes lastActiveAt when it has never been set before', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({ lastActiveAt: null }));

      await service.updateLastActive('auth0|abc');

      assert.equal(prisma.trainerProfile.update.mock.calls.length, 1);
      assert.equal(prisma.trainerProfile.update.mock.calls[0].arguments[0].where.auth0UserId, 'auth0|abc');
    });

    test('is a no-op when the last update was inside the throttle window', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        lastActiveAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
      }));

      await service.updateLastActive('auth0|abc');

      assert.equal(prisma.trainerProfile.update.mock.calls.length, 0);
    });

    test('writes again once the throttle window has passed', async () => {
      prisma.trainerProfile.findUnique.mock.mockImplementationOnce(async () => ({
        lastActiveAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
      }));

      await service.updateLastActive('auth0|abc');

      assert.equal(prisma.trainerProfile.update.mock.calls.length, 1);
    });
  });
});
