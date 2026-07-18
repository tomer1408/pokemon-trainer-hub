const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { REGISTRY, getTableKeys, getTableEntry } = require('./adminDatabaseRegistry');

describe('services/adminDatabaseRegistry', () => {
  test('registers exactly the 8 real models from the plan, nothing invented', () => {
    assert.deepEqual(
      getTableKeys().sort(),
      [
        'adminAuditLogs',
        'avatarIcons',
        'battleMatches',
        'dreamTeamMembers',
        'favorites',
        'supportRequests',
        'trainerNotes',
        'trainerProfiles',
      ].sort(),
    );
  });

  test('getTableEntry returns null for an unknown table, never a real entry', () => {
    assert.equal(getTableEntry('users'), null);
    assert.equal(getTableEntry('__proto__'), null);
  });

  describe('trainerProfiles masking', () => {
    test('masks the raw auth0UserId', () => {
      const row = REGISTRY.trainerProfiles.toSafeRow({
        id: 1,
        auth0UserId: 'auth0|64f2b3c1a9d8e7f6',
        trainerName: 'Ash',
        country: 'Japan',
        dateOfBirth: new Date('2000-01-01'),
        favoriteType: 'electric',
        experienceLevel: 'Beginner',
        teamName: null,
        hasCompletedStarterQuiz: true,
        whosThatBestStreak: 3,
        marketingEmailsOptIn: false,
        acceptedPolicy: true,
        policyVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      assert.notEqual(row.auth0UserId, 'auth0|64f2b3c1a9d8e7f6');
    });

    test('never returns raw dateOfBirth, firstName or lastName — only ageRange', () => {
      const row = REGISTRY.trainerProfiles.toSafeRow({
        id: 1,
        auth0UserId: 'auth0|abc',
        trainerName: 'Ash',
        country: 'Japan',
        dateOfBirth: new Date('2000-01-01'),
        firstName: 'Ash',
        lastName: 'Ketchum',
        favoriteType: 'electric',
        experienceLevel: 'Beginner',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      assert.equal('dateOfBirth' in row, false);
      assert.equal('firstName' in row, false);
      assert.equal('lastName' in row, false);
      assert.ok('ageRange' in row);
    });
  });

  test('trainerNotes never returns the note text, in either shape — only textLength', () => {
    const row = REGISTRY.trainerNotes.toSafeRow({
      id: 1,
      auth0UserId: 'auth0|abc',
      pokemonId: 25,
      text: 'a very private note about this pokemon',
      createdAt: new Date(),
    });

    assert.equal('text' in row, false);
    assert.equal(row.textLength, 'a very private note about this pokemon'.length);
  });

  test('supportRequests never returns raw message/name/email — only a short preview + metadata', () => {
    const longMessage = 'x'.repeat(200);
    const row = REGISTRY.supportRequests.toSafeRow({
      id: 1,
      auth0UserId: 'auth0|abc',
      name: 'Misty',
      email: 'misty@example.com',
      topic: 'billing',
      message: longMessage,
      status: 'open',
      priority: 'normal',
      assignedTo: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    assert.equal('name' in row, false);
    assert.equal('email' in row, false);
    assert.equal('message' in row, false);
    assert.ok(row.messagePreview.length < longMessage.length);
    assert.ok(row.messagePreview.endsWith('…'));
  });

  test('battleMatches list shape omits the raw JSON blobs; detail shape includes them', () => {
    const raw = {
      id: 1,
      auth0UserId: 'auth0|abc',
      opponentName: 'Team Rocket',
      difficulty: 'Hard',
      rounds: 3,
      roundsPlayed: 2,
      opponentType: 'fire',
      luckFactor: 'normal',
      result: 'win',
      yourWins: 2,
      oppWins: 0,
      roundsJson: '[{"round":1}]',
      teamSnapshotJson: '[{"pokemonId":25}]',
      createdAt: new Date(),
    };

    const listRow = REGISTRY.battleMatches.toSafeRow(raw);
    assert.equal('roundsJson' in listRow, false);
    assert.equal('teamSnapshotJson' in listRow, false);

    const detailRow = REGISTRY.battleMatches.toSafeDetail(raw);
    assert.equal(detailRow.roundsJson, raw.roundsJson);
    assert.equal(detailRow.teamSnapshotJson, raw.teamSnapshotJson);
  });

  test('adminAuditLogs masks the acting admin id', () => {
    const row = REGISTRY.adminAuditLogs.toSafeRow({
      id: 1,
      adminAuth0UserId: 'auth0|64f2b3c1a9d8e7f6',
      action: 'trainer.deleted',
      targetType: 'TrainerProfile',
      targetId: 'auth0|xyz',
      detailsJson: null,
      createdAt: new Date(),
    });

    assert.notEqual(row.adminAuth0UserId, 'auth0|64f2b3c1a9d8e7f6');
  });

  test('avatarIcons carries no auth0UserId field at all — nothing to mask', () => {
    const row = REGISTRY.avatarIcons.toSafeRow({
      id: 1,
      pokemonId: 25,
      name: 'Pikachu',
      category: 'Creature',
      spriteUrl: 'https://example.com/pikachu.png',
      sortOrder: 0,
    });

    assert.equal('auth0UserId' in row, false);
  });
});
