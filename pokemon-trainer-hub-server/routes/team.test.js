const { describe, test, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Route-level tests: exercise the real Express router + real
// respondToServiceError status-code mapping, but with jwtCheck and
// teamService swapped for test doubles — so these never touch a real Auth0
// tenant or a real database. teamService's own DB logic has no coverage
// here; these tests are about the HTTP layer (status codes, response
// shapes, error -> status mapping) on top of it.
describe('routes/team', () => {
  let request;
  let teamService;
  const FAKE_USER = 'auth0|test-user';

  before(() => {
    mock.module(path.resolve(__dirname, '../middleware/auth.js'), {
      exports: {
        default: (req, res, next) => {
          req.auth = { payload: { sub: FAKE_USER } };
          next();
        },
      },
    });

    teamService = {
      getTeam: mock.fn(async () => []),
      addToTeam: mock.fn(),
      removeFromTeam: mock.fn(async () => {}),
      swapTeamMember: mock.fn(),
      reorderTeam: mock.fn(async () => {}),
      saveTeam: mock.fn(),
    };
    mock.module(path.resolve(__dirname, '../services/teamService.js'), {
      exports: { default: teamService },
    });

    const express = require('express');
    const supertest = require('supertest');
    const teamRouter = require('./team');

    const app = express();
    app.use(express.json());
    app.use('/api/team', teamRouter);
    // Same shape as server.js's real error handler — routes here rely on it
    // for anything they don't catch themselves (e.g. a non-ServiceError throw).
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({ message: 'Something went wrong on our end.' });
    });

    request = supertest(app);
  });

  beforeEach(() => {
    teamService.getTeam.mock.resetCalls();
    teamService.addToTeam.mock.resetCalls();
    teamService.removeFromTeam.mock.resetCalls();
    teamService.swapTeamMember.mock.resetCalls();
    teamService.reorderTeam.mock.resetCalls();
    teamService.saveTeam.mock.resetCalls();
  });

  test('GET / returns the team from teamService, identified by the JWT subject', async () => {
    const fakeTeam = [{ pokemonId: 25, pokemonName: 'pikachu' }];
    teamService.getTeam.mock.mockImplementationOnce(async () => fakeTeam);

    const res = await request.get('/api/team');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, fakeTeam);
    assert.equal(teamService.getTeam.mock.calls[0].arguments[0], FAKE_USER);
  });

  test('POST /:id adds a Pokémon and returns 201', async () => {
    const result = { message: 'pikachu joined your Dream Team!', member: { pokemonId: 25 } };
    teamService.addToTeam.mock.mockImplementationOnce(async () => result);

    const res = await request.post('/api/team/25');

    assert.equal(res.status, 201);
    assert.deepEqual(res.body, result);
    assert.deepEqual(teamService.addToTeam.mock.calls[0].arguments, [FAKE_USER, 25]);
  });

  test('POST /:id with a non-numeric id is rejected before touching teamService', async () => {
    const res = await request.post('/api/team/not-a-number');

    assert.equal(res.status, 400);
    assert.equal(teamService.addToTeam.mock.calls.length, 0);
  });

  test('POST /:id maps a DUPLICATE ServiceError to 409 with the reason', async () => {
    const ServiceError = require('../services/serviceError');
    teamService.addToTeam.mock.mockImplementationOnce(async () => {
      throw new ServiceError('DUPLICATE', 'Pikachu is already in your team.');
    });

    const res = await request.post('/api/team/25');

    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { reason: 'DUPLICATE', message: 'Pikachu is already in your team.' });
  });

  test('POST /:id maps a TEAM_FULL ServiceError to 409 with the reason', async () => {
    const ServiceError = require('../services/serviceError');
    teamService.addToTeam.mock.mockImplementationOnce(async () => {
      throw new ServiceError('TEAM_FULL', 'Your Dream Team is already full (5/5).');
    });

    const res = await request.post('/api/team/25');

    assert.equal(res.status, 409);
    assert.equal(res.body.reason, 'TEAM_FULL');
  });

  test('POST /:id maps an UPSTREAM_ERROR ServiceError to 502', async () => {
    const ServiceError = require('../services/serviceError');
    teamService.addToTeam.mock.mockImplementationOnce(async () => {
      throw new ServiceError('UPSTREAM_ERROR', 'PokeAPI is unavailable. Please try again later.');
    });

    const res = await request.post('/api/team/25');

    assert.equal(res.status, 502);
    assert.deepEqual(res.body, { message: 'PokeAPI is unavailable. Please try again later.' });
  });

  test('DELETE /:id removes the Pokémon and returns 204 with an empty body', async () => {
    const res = await request.delete('/api/team/25');

    assert.equal(res.status, 204);
    assert.deepEqual(teamService.removeFromTeam.mock.calls[0].arguments, [FAKE_USER, 25]);
  });

  test('PUT / rejects a non-array pokemonIds without calling teamService', async () => {
    const res = await request.put('/api/team').send({ pokemonIds: 'not-an-array' });

    assert.equal(res.status, 400);
    assert.equal(teamService.saveTeam.mock.calls.length, 0);
  });

  test('PUT / rejects an array containing a non-integer id', async () => {
    const res = await request.put('/api/team').send({ pokemonIds: [25, 'oops'] });

    assert.equal(res.status, 400);
    assert.equal(teamService.saveTeam.mock.calls.length, 0);
  });

  test('PUT / saves the full team and returns it', async () => {
    const savedTeam = [{ pokemonId: 25 }, { pokemonId: 6 }];
    teamService.saveTeam.mock.mockImplementationOnce(async () => savedTeam);

    const res = await request.put('/api/team').send({ pokemonIds: [25, 6] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, savedTeam);
    assert.deepEqual(teamService.saveTeam.mock.calls[0].arguments, [FAKE_USER, [25, 6]]);
  });

  test('POST /swap rejects a non-numeric removePokemonId/addPokemonId', async () => {
    const res = await request.post('/api/team/swap').send({ removePokemonId: '25', addPokemonId: 6 });

    assert.equal(res.status, 400);
    assert.equal(teamService.swapTeamMember.mock.calls.length, 0);
  });

  test('POST /swap swaps members and returns 200', async () => {
    const result = { message: 'Swapped pikachu for charmander!', member: { pokemonId: 4 } };
    teamService.swapTeamMember.mock.mockImplementationOnce(async () => result);

    const res = await request.post('/api/team/swap').send({ removePokemonId: 25, addPokemonId: 4 });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, result);
    assert.deepEqual(teamService.swapTeamMember.mock.calls[0].arguments, [FAKE_USER, 25, 4]);
  });

  test('POST /swap is reachable, not swallowed by the /:id route', async () => {
    // Regression guard for the exact ordering bug the route file's own
    // comment warns about: /swap must be registered before /:id.
    teamService.swapTeamMember.mock.mockImplementationOnce(async () => ({ message: 'ok' }));

    await request.post('/api/team/swap').send({ removePokemonId: 25, addPokemonId: 4 });

    assert.equal(teamService.swapTeamMember.mock.calls.length, 1);
    assert.equal(teamService.addToTeam.mock.calls.length, 0);
  });

  test('PATCH /reorder rejects an empty pokemonIds array', async () => {
    const res = await request.patch('/api/team/reorder').send({ pokemonIds: [] });

    assert.equal(res.status, 400);
    assert.equal(teamService.reorderTeam.mock.calls.length, 0);
  });

  test('PATCH /reorder persists the new order and returns a confirmation message', async () => {
    const res = await request.patch('/api/team/reorder').send({ pokemonIds: [6, 25] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'Team order saved.' });
    assert.deepEqual(teamService.reorderTeam.mock.calls[0].arguments, [FAKE_USER, [6, 25]]);
  });

  test('PATCH /reorder maps an INVALID_ORDER ServiceError to 400', async () => {
    const ServiceError = require('../services/serviceError');
    teamService.reorderTeam.mock.mockImplementationOnce(async () => {
      throw new ServiceError('INVALID_ORDER', 'The new order must contain exactly your current team members.');
    });

    const res = await request.patch('/api/team/reorder').send({ pokemonIds: [6, 25] });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: 'The new order must contain exactly your current team members.' });
  });
});
