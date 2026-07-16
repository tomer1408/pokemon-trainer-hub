const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Direct unit tests for teamService's own logic — previously only exercised
// indirectly through routes/team.test.js, which mocks this whole module out
// and never actually runs it. This is the highest-priority gap identified in
// the test coverage review: the most business-critical logic in the project
// (duplicate detection, team-size enforcement, slot position management, the
// swap/reorder/save transactions) had never been tested directly.
//
// Mocks services/prisma.js (a single exported Prisma Client instance — same
// "default" wrapper convention as middleware/auth.js) and services/pokeapi.js
// (destructured named export, no wrapper — same convention as
// routes/pokemon.test.js) so this never touches a real database or PokeAPI.
describe('services/teamService', () => {
  let teamService;
  let prisma;
  let pokeapi;
  const USER = 'auth0|test-user';

  before(() => {
    prisma = {
      dreamTeamMember: {
        findMany: mock.fn(async () => []),
        findUnique: mock.fn(async () => null),
        count: mock.fn(async () => 0),
        aggregate: mock.fn(async () => ({ _max: { position: null } })),
        create: mock.fn(async ({ data }) => ({ id: 1, ...data })),
        delete: mock.fn(async ({ where }) => ({ id: 1, ...where })),
        deleteMany: mock.fn(async () => ({ count: 1 })),
        update: mock.fn(async ({ where, data }) => ({ id: 1, ...where, ...data })),
      },
      $transaction: mock.fn(async (ops) => Promise.all(ops)),
    };
    mock.module(path.resolve(__dirname, './prisma.js'), { exports: { default: prisma } });

    pokeapi = {
      fetchPokemonDetail: mock.fn(async (id) => ({
        id,
        name: `mon-${id}`,
        spriteUrl: `sprite-${id}`,
        stats: [{ name: 'hp', value: 50 }],
        types: ['fire'],
        baseExperience: 100,
      })),
    };
    mock.module(path.resolve(__dirname, './pokeapi.js'), { exports: pokeapi });

    teamService = require('./teamService');
  });

  function resetAll() {
    prisma.dreamTeamMember.findMany.mock.resetCalls();
    prisma.dreamTeamMember.findUnique.mock.resetCalls();
    prisma.dreamTeamMember.count.mock.resetCalls();
    prisma.dreamTeamMember.aggregate.mock.resetCalls();
    prisma.dreamTeamMember.create.mock.resetCalls();
    prisma.dreamTeamMember.delete.mock.resetCalls();
    prisma.dreamTeamMember.deleteMany.mock.resetCalls();
    prisma.dreamTeamMember.update.mock.resetCalls();
    prisma.$transaction.mock.resetCalls();
    pokeapi.fetchPokemonDetail.mock.resetCalls();
  }

  beforeEach(() => {
    resetAll();
    // Restore each mock's default implementation — individual tests below
    // override just what they need with mockImplementationOnce.
    prisma.dreamTeamMember.findMany.mock.mockImplementation(async () => []);
    prisma.dreamTeamMember.findUnique.mock.mockImplementation(async () => null);
    prisma.dreamTeamMember.count.mock.mockImplementation(async () => 0);
    prisma.dreamTeamMember.aggregate.mock.mockImplementation(async () => ({ _max: { position: null } }));
    prisma.dreamTeamMember.create.mock.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    prisma.dreamTeamMember.delete.mock.mockImplementation(async ({ where }) => ({ id: 1, ...where }));
    prisma.dreamTeamMember.deleteMany.mock.mockImplementation(async () => ({ count: 1 }));
    prisma.dreamTeamMember.update.mock.mockImplementation(async ({ where, data }) => ({ id: 1, ...where, ...data }));
    prisma.$transaction.mock.mockImplementation(async (ops) => Promise.all(ops));
    pokeapi.fetchPokemonDetail.mock.mockImplementation(async (id) => ({
      id,
      name: `mon-${id}`,
      spriteUrl: `sprite-${id}`,
      stats: [{ name: 'hp', value: 50 }],
      types: ['fire'],
      baseExperience: 100,
    }));
  });

  describe('getTeam', () => {
    test('enriches each member with real stats/types/baseExperience', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [
        { pokemonId: 25, pokemonName: 'pikachu', spriteUrl: 's', addedAt: 't', position: 0 },
      ]);

      const team = await teamService.getTeam(USER);

      assert.equal(team.length, 1);
      assert.deepEqual(team[0].stats, [{ name: 'hp', value: 50 }]);
      assert.deepEqual(team[0].types, ['fire']);
      assert.equal(team[0].baseExperience, 100);
    });

    test('degrades gracefully (empty stats/types, 0 power) when PokeAPI fails for one member', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [
        { pokemonId: 25, pokemonName: 'pikachu', spriteUrl: 's', addedAt: 't', position: 0 },
      ]);
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => {
        throw new Error('PokeAPI down');
      });

      const team = await teamService.getTeam(USER);

      assert.equal(team.length, 1);
      assert.deepEqual(team[0].stats, []);
      assert.deepEqual(team[0].types, []);
      assert.equal(team[0].baseExperience, 0);
    });
  });

  describe('addToTeam', () => {
    test('adds a new member at the next free position (max + 1, not row count)', async () => {
      // Simulates a gap: positions 0,2,3 survive after a removal — count is
      // 3 but the next real free slot must be 4 (max+1), never 3.
      prisma.dreamTeamMember.aggregate.mock.mockImplementationOnce(async () => ({ _max: { position: 3 } }));
      prisma.dreamTeamMember.count.mock.mockImplementationOnce(async () => 3);

      const result = await teamService.addToTeam(USER, 25);

      assert.equal(result.member.position, 4);
      assert.equal(result.message, 'mon-25 joined your Dream Team!');
    });

    test('throws DUPLICATE and never creates when the Pokémon is already on the team', async () => {
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => ({ pokemonName: 'pikachu' }));

      await assert.rejects(() => teamService.addToTeam(USER, 25), (err) => err.code === 'DUPLICATE');
      assert.equal(prisma.dreamTeamMember.create.mock.calls.length, 0);
    });

    test('throws TEAM_FULL and never creates when the team already has 5 members', async () => {
      prisma.dreamTeamMember.count.mock.mockImplementationOnce(async () => 5);

      await assert.rejects(() => teamService.addToTeam(USER, 25), (err) => err.code === 'TEAM_FULL');
      assert.equal(prisma.dreamTeamMember.create.mock.calls.length, 0);
    });

    test('throws UPSTREAM_ERROR and never creates when PokeAPI is unreachable', async () => {
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => {
        throw new Error('network down');
      });

      await assert.rejects(() => teamService.addToTeam(USER, 25), (err) => err.code === 'UPSTREAM_ERROR');
      assert.equal(prisma.dreamTeamMember.create.mock.calls.length, 0);
    });

    test('throws NOT_FOUND and never creates when the Pokémon id does not resolve', async () => {
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => null);

      await assert.rejects(() => teamService.addToTeam(USER, 999999), (err) => err.code === 'NOT_FOUND');
      assert.equal(prisma.dreamTeamMember.create.mock.calls.length, 0);
    });
  });

  describe('removeFromTeam', () => {
    test('scopes the delete to both auth0UserId and pokemonId (IDOR-safe) and is idempotent', async () => {
      await teamService.removeFromTeam(USER, 25);

      assert.deepEqual(prisma.dreamTeamMember.deleteMany.mock.calls[0].arguments[0], {
        where: { auth0UserId: USER, pokemonId: 25 },
      });
    });
  });

  describe('swapTeamMember', () => {
    test('throws NOT_FOUND and never opens a transaction when the pokemon-to-remove is not on the team', async () => {
      await assert.rejects(() => teamService.swapTeamMember(USER, 25, 6), (err) => err.code === 'NOT_FOUND');
      assert.equal(prisma.$transaction.mock.calls.length, 0);
    });

    test('throws DUPLICATE and never opens a transaction when the incoming Pokémon is already on the team', async () => {
      // mockImplementationOnce targets an explicit call index (not a FIFO
      // queue) — findUnique is called twice here (toRemove, then
      // existingAdd), so each override must name its own index.
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => ({ position: 0, pokemonName: 'pikachu' }), 0);
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => ({ pokemonName: 'charmander' }), 1);

      await assert.rejects(() => teamService.swapTeamMember(USER, 25, 4), (err) => err.code === 'DUPLICATE');
      assert.equal(prisma.$transaction.mock.calls.length, 0);
    });

    test('throws UPSTREAM_ERROR when PokeAPI is unreachable for the incoming Pokémon', async () => {
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => ({ position: 0, pokemonName: 'pikachu' }), 0);
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => null, 1);
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => {
        throw new Error('down');
      });

      await assert.rejects(() => teamService.swapTeamMember(USER, 25, 4), (err) => err.code === 'UPSTREAM_ERROR');
    });

    test('throws NOT_FOUND when the incoming Pokémon id does not resolve', async () => {
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => ({ position: 0, pokemonName: 'pikachu' }), 0);
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => null, 1);
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => null);

      await assert.rejects(() => teamService.swapTeamMember(USER, 25, 999999), (err) => err.code === 'NOT_FOUND');
    });

    test('swaps atomically and the incoming Pokémon takes over the removed slot position', async () => {
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => ({ position: 2, pokemonName: 'pikachu' }), 0);
      prisma.dreamTeamMember.findUnique.mock.mockImplementationOnce(async () => null, 1);

      const result = await teamService.swapTeamMember(USER, 25, 4);

      assert.equal(prisma.$transaction.mock.calls.length, 1);
      assert.equal(prisma.dreamTeamMember.delete.mock.calls.length, 1);
      assert.equal(prisma.dreamTeamMember.create.mock.calls.length, 1);
      assert.equal(prisma.dreamTeamMember.create.mock.calls[0].arguments[0].data.position, 2);
      assert.equal(result.message, 'Swapped pikachu for mon-4!');
    });
  });

  describe('reorderTeam', () => {
    test('rejects an order longer than 5 without touching the database', async () => {
      await assert.rejects(
        () => teamService.reorderTeam(USER, [1, 2, 3, 4, 5, 6]),
        (err) => err.code === 'INVALID_ORDER',
      );
      assert.equal(prisma.dreamTeamMember.findMany.mock.calls.length, 0);
    });

    test('rejects an order whose length does not match the current team', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [{ pokemonId: 25 }, { pokemonId: 6 }]);

      await assert.rejects(() => teamService.reorderTeam(USER, [25]), (err) => err.code === 'INVALID_ORDER');
      assert.equal(prisma.$transaction.mock.calls.length, 0);
    });

    test('rejects an order containing an id not on the current team, even with the right length', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [{ pokemonId: 25 }, { pokemonId: 6 }]);

      await assert.rejects(() => teamService.reorderTeam(USER, [25, 999]), (err) => err.code === 'INVALID_ORDER');
      assert.equal(prisma.$transaction.mock.calls.length, 0);
    });

    test('persists the new position for every member, in the submitted order', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [{ pokemonId: 25 }, { pokemonId: 6 }]);

      await teamService.reorderTeam(USER, [6, 25]);

      assert.equal(prisma.$transaction.mock.calls.length, 1);
      assert.equal(prisma.dreamTeamMember.update.mock.calls.length, 2);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[0].arguments[0].data.position, 0);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[0].arguments[0].where.auth0UserId_pokemonId.pokemonId, 6);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[1].arguments[0].data.position, 1);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[1].arguments[0].where.auth0UserId_pokemonId.pokemonId, 25);
    });
  });

  describe('saveTeam', () => {
    test('rejects a submitted team larger than 5 without touching the database', async () => {
      await assert.rejects(
        () => teamService.saveTeam(USER, [1, 2, 3, 4, 5, 6]),
        (err) => err.code === 'INVALID_ORDER',
      );
      assert.equal(prisma.dreamTeamMember.findMany.mock.calls.length, 0);
    });

    test('rejects a submitted team containing a duplicate Pokémon id', async () => {
      await assert.rejects(() => teamService.saveTeam(USER, [25, 25]), (err) => err.code === 'INVALID_ORDER');
      assert.equal(prisma.dreamTeamMember.findMany.mock.calls.length, 0);
    });

    test('throws UPSTREAM_ERROR when fetching a newly-added member fails, before any write', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => []);
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => {
        throw new Error('down');
      });

      await assert.rejects(() => teamService.saveTeam(USER, [25]), (err) => err.code === 'UPSTREAM_ERROR');
      assert.equal(prisma.$transaction.mock.calls.length, 0);
    });

    test('throws NOT_FOUND when a newly-added member id does not resolve to a real Pokémon', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => []);
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => null);

      await assert.rejects(() => teamService.saveTeam(USER, [999999]), (err) => err.code === 'NOT_FOUND');
      assert.equal(prisma.$transaction.mock.calls.length, 0);
    });

    test('diffs correctly: removes dropped members, repositions kept members, creates new ones — as one transaction', async () => {
      // Current: 25 (pos 0), 6 (pos 1), 9 (pos 2). New order: 9, 25, 4 — so 6
      // is dropped, 9 and 25 are kept but repositioned, 4 is newly added.
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [
        { pokemonId: 25, position: 0 },
        { pokemonId: 6, position: 1 },
        { pokemonId: 9, position: 2 },
      ]);

      await teamService.saveTeam(USER, [9, 25, 4]);

      assert.equal(prisma.$transaction.mock.calls.length, 1);
      const ops = prisma.$transaction.mock.calls[0].arguments[0];
      assert.equal(ops.length, 4); // 1 delete (6) + 2 updates (9, 25) + 1 create (4)

      assert.equal(prisma.dreamTeamMember.delete.mock.calls.length, 1);
      assert.equal(prisma.dreamTeamMember.delete.mock.calls[0].arguments[0].where.auth0UserId_pokemonId.pokemonId, 6);

      assert.equal(prisma.dreamTeamMember.update.mock.calls.length, 2);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[0].arguments[0].where.auth0UserId_pokemonId.pokemonId, 9);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[0].arguments[0].data.position, 0);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[1].arguments[0].where.auth0UserId_pokemonId.pokemonId, 25);
      assert.equal(prisma.dreamTeamMember.update.mock.calls[1].arguments[0].data.position, 1);

      assert.equal(prisma.dreamTeamMember.create.mock.calls.length, 1);
      assert.equal(prisma.dreamTeamMember.create.mock.calls[0].arguments[0].data.pokemonId, 4);
      assert.equal(prisma.dreamTeamMember.create.mock.calls[0].arguments[0].data.position, 2);
    });

    test('an empty team saved as empty is a no-op — no transaction opened', async () => {
      prisma.dreamTeamMember.findMany.mock.mockImplementation(async () => []);

      await teamService.saveTeam(USER, []);

      assert.equal(prisma.$transaction.mock.calls.length, 0);
    });

    test('returns the fresh team read back from the database after saving', async () => {
      // saveTeam reads the current team once for its diff, then calls
      // getTeam() at the end, which reads findMany a second time — each
      // needs its own explicit call index.
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [], 0); // current (empty)
      prisma.dreamTeamMember.findMany.mock.mockImplementationOnce(async () => [
        { pokemonId: 25, pokemonName: 'pikachu', spriteUrl: 's', addedAt: 't', position: 0 },
      ], 1); // getTeam()'s own read at the end

      const result = await teamService.saveTeam(USER, [25]);

      assert.equal(result.length, 1);
      assert.equal(result[0].pokemonId, 25);
    });
  });
});
