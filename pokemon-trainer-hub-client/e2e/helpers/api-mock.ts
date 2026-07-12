import { Page } from '@playwright/test';

// Mocks the real Express API (localhost:3000) at the network level, so the
// authenticated E2E flow never depends on a real database or a real Auth0
// access token being accepted by the server's jwtCheck. Shapes here match
// the client's own TrainerProfile/DreamTeamMember/PokemonSummary/TypeChart
// interfaces (src/app/core/*.ts) — verified against the source, not guessed.

const API_BASE = 'http://localhost:3000/api';

const PIKACHU_SPRITE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png';

export const MOCK_PROFILE = {
  trainerName: 'E2E Trainer',
  favoriteType: 'Electric',
  experienceLevel: 'Beginner',
  firstName: 'Ash',
  lastName: 'Ketchum',
  dateOfBirth: '2000-01-01T00:00:00.000Z',
  country: 'United States',
  avatarPokemonId: 25,
  teamName: 'E2E Squad',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasCompletedStarterQuiz: true,
  acceptedPolicy: true,
  acceptedPolicyAt: '2026-01-01T00:00:00.000Z',
  policyVersion: 'v1',
  marketingEmailsOptIn: false,
  whosThatBestStreak: 0,
  ageRange: '18-24',
};

export const MOCK_TEAM = [
  {
    pokemonId: 25,
    pokemonName: 'pikachu',
    spriteUrl: PIKACHU_SPRITE,
    addedAt: '2026-01-01T00:00:00.000Z',
    position: 0,
    stats: [
      { name: 'hp', value: 35 },
      { name: 'attack', value: 55 },
      { name: 'defense', value: 40 },
    ],
    types: ['electric'],
    baseExperience: 112,
  },
];

// A small but real-shaped type chart — enough for the Battle Readiness /
// Matchup Analysis cards to compute something meaningful for a
// single-electric-type team, without needing all 18 real entries.
export const MOCK_TYPE_CHART = {
  electric: { weak: ['ground'], resist: ['electric', 'flying', 'steel'], strong: ['water', 'flying'] },
  ground: { weak: ['water', 'grass', 'ice'], resist: ['poison', 'rock'], strong: ['electric', 'poison', 'rock', 'fire', 'steel'] },
  water: { weak: ['grass', 'electric'], resist: ['fire', 'water', 'ice', 'steel'], strong: ['fire', 'ground', 'rock'] },
  flying: { weak: ['rock', 'electric', 'ice'], resist: ['grass', 'fighting', 'bug'], strong: ['grass', 'fighting', 'bug'] },
};

function pokemonDetailFor(id: number) {
  return {
    id,
    name: id === 25 ? 'pikachu' : `pokemon-${id}`,
    baseExperience: 112,
    types: ['electric'],
    spriteUrl: PIKACHU_SPRITE,
    stats: [{ name: 'hp', value: 35 }],
    abilities: [{ name: 'static', description: 'May paralyze on contact.' }],
    cry: null,
    height: 0.4,
    weight: 6,
    flavorText: 'A mocked Pokémon for E2E testing.',
    weaknesses: ['ground'],
    resistances: ['flying', 'steel'],
    topMoves: [{ name: 'thunderbolt', type: 'electric', power: 90 }],
  };
}

export async function mockApi(page: Page): Promise<void> {
  await page.route(`${API_BASE}/profile`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) });
  });

  await page.route(`${API_BASE}/team`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TEAM) });
  });

  await page.route(`${API_BASE}/favorites`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // A single branching handler for every /pokemon* path, rather than several
  // page.route() calls with overlapping globs — Playwright matches multiple
  // registered routes for the same request last-registered-first, which
  // previously let the generic "/pokemon/*" detail handler shadow the more
  // specific "/pokemon/type-chart" route entirely.
  await page.route(`${API_BASE}/pokemon**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/pokemon/type-chart')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TYPE_CHART) });
      return;
    }

    if (path === '/api/pokemon') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], page: 1, pageSize: 20, total: 0 }),
      });
      return;
    }

    const idPart = path.split('/').pop() ?? '25';
    const id = Number.parseInt(idPart, 10) || 25;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pokemonDetailFor(id)) });
  });
}
