const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Direct unit tests for favoritesService's own logic — same gap pattern
// teamService.js had: previously only exercised indirectly through
// routes/favorites.test.js, which mocks this whole module out.
describe('services/favoritesService', () => {
  let favoritesService;
  let prisma;
  let pokeapi;
  const USER = 'auth0|test-user';

  before(() => {
    prisma = {
      favorite: {
        findMany: mock.fn(async () => []),
        findUnique: mock.fn(async () => null),
        create: mock.fn(async ({ data }) => ({ id: 1, ...data })),
        deleteMany: mock.fn(async () => ({ count: 1 })),
      },
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

    favoritesService = require('./favoritesService');
  });

  beforeEach(() => {
    prisma.favorite.findMany.mock.resetCalls();
    prisma.favorite.findUnique.mock.resetCalls();
    prisma.favorite.create.mock.resetCalls();
    prisma.favorite.deleteMany.mock.resetCalls();
    pokeapi.fetchPokemonDetail.mock.resetCalls();

    prisma.favorite.findMany.mock.mockImplementation(async () => []);
    prisma.favorite.findUnique.mock.mockImplementation(async () => null);
    prisma.favorite.create.mock.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    prisma.favorite.deleteMany.mock.mockImplementation(async () => ({ count: 1 }));
    pokeapi.fetchPokemonDetail.mock.mockImplementation(async (id) => ({
      id,
      name: `mon-${id}`,
      spriteUrl: `sprite-${id}`,
      stats: [{ name: 'hp', value: 50 }],
      types: ['fire'],
      baseExperience: 100,
    }));
  });

  describe('getFavorites', () => {
    test('enriches each favorite with real stats/types/baseExperience', async () => {
      prisma.favorite.findMany.mock.mockImplementationOnce(async () => [
        { pokemonId: 25, pokemonName: 'pikachu', spriteUrl: 's', addedAt: 't' },
      ]);

      const favorites = await favoritesService.getFavorites(USER);

      assert.equal(favorites.length, 1);
      assert.deepEqual(favorites[0].stats, [{ name: 'hp', value: 50 }]);
      assert.deepEqual(favorites[0].types, ['fire']);
      assert.equal(favorites[0].baseExperience, 100);
    });

    test('degrades gracefully (empty stats/types, 0 power) when PokeAPI fails for one favorite', async () => {
      prisma.favorite.findMany.mock.mockImplementationOnce(async () => [
        { pokemonId: 25, pokemonName: 'pikachu', spriteUrl: 's', addedAt: 't' },
      ]);
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => {
        throw new Error('PokeAPI down');
      });

      const favorites = await favoritesService.getFavorites(USER);

      assert.equal(favorites.length, 1);
      assert.deepEqual(favorites[0].stats, []);
      assert.deepEqual(favorites[0].types, []);
      assert.equal(favorites[0].baseExperience, 0);
    });
  });

  describe('addFavorite', () => {
    test('adds a new favorite when it is not a duplicate and the Pokémon resolves', async () => {
      const result = await favoritesService.addFavorite(USER, 25);

      assert.equal(result.message, 'mon-25 added to your favorites!');
      assert.equal(prisma.favorite.create.mock.calls.length, 1);
      assert.equal(prisma.favorite.create.mock.calls[0].arguments[0].data.pokemonId, 25);
    });

    test('throws DUPLICATE and never creates when already favorited', async () => {
      prisma.favorite.findUnique.mock.mockImplementationOnce(async () => ({ pokemonName: 'pikachu' }));

      await assert.rejects(() => favoritesService.addFavorite(USER, 25), (err) => err.code === 'DUPLICATE');
      assert.equal(prisma.favorite.create.mock.calls.length, 0);
    });

    test('throws UPSTREAM_ERROR and never creates when PokeAPI is unreachable', async () => {
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => {
        throw new Error('network down');
      });

      await assert.rejects(() => favoritesService.addFavorite(USER, 25), (err) => err.code === 'UPSTREAM_ERROR');
      assert.equal(prisma.favorite.create.mock.calls.length, 0);
    });

    test('throws NOT_FOUND and never creates when the Pokémon id does not resolve', async () => {
      pokeapi.fetchPokemonDetail.mock.mockImplementationOnce(async () => null);

      await assert.rejects(() => favoritesService.addFavorite(USER, 999999), (err) => err.code === 'NOT_FOUND');
      assert.equal(prisma.favorite.create.mock.calls.length, 0);
    });
  });

  describe('removeFavorite', () => {
    test('scopes the delete to both auth0UserId and pokemonId (IDOR-safe) and is idempotent', async () => {
      await favoritesService.removeFavorite(USER, 25);

      assert.deepEqual(prisma.favorite.deleteMany.mock.calls[0].arguments[0], {
        where: { auth0UserId: USER, pokemonId: 25 },
      });
    });
  });
});
