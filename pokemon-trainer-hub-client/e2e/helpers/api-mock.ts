import { Page } from '@playwright/test';

// Mocks the real Express API (localhost:3000) at the network level, so E2E
// tests never depend on a real database or a real Auth0 access token being
// accepted by the server's jwtCheck. Shapes here match the client's own
// core/*.ts interfaces — verified against the source, not guessed.
//
// Unlike the original read-only version of this file, every route below is
// a real, stateful in-memory mock: POST/DELETE/PATCH/PUT actually mutate the
// arrays this closure holds, so a write-flow E2E test (add to team, submit a
// note, save a profile edit, etc.) can assert on the mutation actually
// having happened — not just that the button click didn't crash.

const API_BASE = 'http://localhost:3000/api';

function sprite(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

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
    spriteUrl: sprite(25),
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
  fire: { weak: ['water', 'ground', 'rock'], resist: ['fire', 'grass', 'ice', 'steel'], strong: ['grass', 'ice', 'steel'] },
  grass: { weak: ['fire', 'ice', 'poison', 'flying'], resist: ['water', 'grass', 'ground'], strong: ['water', 'ground', 'rock'] },
  flying: { weak: ['rock', 'electric', 'ice'], resist: ['grass', 'fighting', 'bug'], strong: ['grass', 'fighting', 'bug'] },
  normal: { weak: ['fighting'], resist: [], strong: [] },
};

// A small real-named catalog so Explorer's search/type-filter has something
// meaningful to actually find, instead of an always-empty result set.
const CATALOG: { id: number; name: string; types: string[]; baseExperience: number }[] = [
  { id: 1, name: 'bulbasaur', types: ['grass'], baseExperience: 64 },
  { id: 4, name: 'charmander', types: ['fire'], baseExperience: 62 },
  { id: 6, name: 'charizard', types: ['fire', 'flying'], baseExperience: 267 },
  { id: 7, name: 'squirtle', types: ['water'], baseExperience: 63 },
  { id: 25, name: 'pikachu', types: ['electric'], baseExperience: 112 },
  { id: 94, name: 'gengar', types: ['ghost', 'poison'], baseExperience: 225 },
  { id: 130, name: 'gyarados', types: ['water', 'flying'], baseExperience: 189 },
  { id: 133, name: 'eevee', types: ['normal'], baseExperience: 65 },
  { id: 143, name: 'snorlax', types: ['normal'], baseExperience: 189 },
  { id: 150, name: 'mewtwo', types: ['psychic'], baseExperience: 306 },
  // The rest exist purely so the real Starter Quiz scoring service (which
  // requires >= MIN_VALID_CANDIDATES = 40 real Gen 1 Pokémon before it will
  // trust the pool at all — see quiz-recommendation.service.ts) has enough
  // real, distinct entries to work with — real Gen 1 names/ids/types, not
  // fabricated ones.
  { id: 2, name: 'ivysaur', types: ['grass', 'poison'], baseExperience: 142 },
  { id: 3, name: 'venusaur', types: ['grass', 'poison'], baseExperience: 236 },
  { id: 5, name: 'charmeleon', types: ['fire'], baseExperience: 142 },
  { id: 8, name: 'wartortle', types: ['water'], baseExperience: 142 },
  { id: 9, name: 'blastoise', types: ['water'], baseExperience: 239 },
  { id: 10, name: 'caterpie', types: ['bug'], baseExperience: 39 },
  { id: 12, name: 'butterfree', types: ['bug', 'flying'], baseExperience: 178 },
  { id: 13, name: 'weedle', types: ['bug', 'poison'], baseExperience: 39 },
  { id: 15, name: 'beedrill', types: ['bug', 'poison'], baseExperience: 178 },
  { id: 16, name: 'pidgey', types: ['normal', 'flying'], baseExperience: 50 },
  { id: 19, name: 'rattata', types: ['normal'], baseExperience: 51 },
  { id: 21, name: 'spearow', types: ['normal', 'flying'], baseExperience: 52 },
  { id: 23, name: 'ekans', types: ['poison'], baseExperience: 58 },
  { id: 27, name: 'sandshrew', types: ['ground'], baseExperience: 60 },
  { id: 29, name: 'nidoran-f', types: ['poison'], baseExperience: 55 },
  { id: 32, name: 'nidoran-m', types: ['poison'], baseExperience: 55 },
  { id: 37, name: 'vulpix', types: ['fire'], baseExperience: 63 },
  { id: 39, name: 'jigglypuff', types: ['normal', 'fairy'], baseExperience: 95 },
  { id: 41, name: 'zubat', types: ['poison', 'flying'], baseExperience: 49 },
  { id: 43, name: 'oddish', types: ['grass', 'poison'], baseExperience: 64 },
  { id: 46, name: 'paras', types: ['bug', 'grass'], baseExperience: 57 },
  { id: 48, name: 'venonat', types: ['bug', 'poison'], baseExperience: 61 },
  { id: 50, name: 'diglett', types: ['ground'], baseExperience: 53 },
  { id: 52, name: 'meowth', types: ['normal'], baseExperience: 58 },
  { id: 54, name: 'psyduck', types: ['water'], baseExperience: 64 },
  { id: 56, name: 'mankey', types: ['fighting'], baseExperience: 61 },
  { id: 58, name: 'growlithe', types: ['fire'], baseExperience: 70 },
  { id: 60, name: 'poliwag', types: ['water'], baseExperience: 60 },
  { id: 63, name: 'abra', types: ['psychic'], baseExperience: 62 },
  { id: 66, name: 'machop', types: ['fighting'], baseExperience: 61 },
  { id: 69, name: 'bellsprout', types: ['grass', 'poison'], baseExperience: 60 },
  { id: 72, name: 'tentacool', types: ['water', 'poison'], baseExperience: 67 },
  { id: 74, name: 'geodude', types: ['rock', 'ground'], baseExperience: 60 },
  { id: 77, name: 'ponyta', types: ['fire'], baseExperience: 82 },
  { id: 79, name: 'slowpoke', types: ['water', 'psychic'], baseExperience: 63 },
  { id: 81, name: 'magnemite', types: ['electric', 'steel'], baseExperience: 65 },
  { id: 84, name: 'doduo', types: ['normal', 'flying'], baseExperience: 62 },
  { id: 86, name: 'seel', types: ['water'], baseExperience: 65 },
  { id: 88, name: 'grimer', types: ['poison'], baseExperience: 65 },
  { id: 90, name: 'shellder', types: ['water'], baseExperience: 61 },
  { id: 92, name: 'gastly', types: ['ghost', 'poison'], baseExperience: 62 },
  { id: 95, name: 'onix', types: ['rock', 'ground'], baseExperience: 77 },
  { id: 98, name: 'krabby', types: ['water'], baseExperience: 65 },
  { id: 100, name: 'voltorb', types: ['electric'], baseExperience: 66 },
];

function toSummary(c: (typeof CATALOG)[number]) {
  return {
    id: c.id,
    name: c.name,
    baseExperience: c.baseExperience,
    types: c.types,
    spriteUrl: sprite(c.id),
    stats: [
      { name: 'hp', value: 45 },
      { name: 'attack', value: 49 },
      { name: 'defense', value: 49 },
    ],
  };
}

function pokemonDetailFor(id: number) {
  const known = CATALOG.find((c) => c.id === id);
  return {
    id,
    name: known?.name ?? (id === 25 ? 'pikachu' : `pokemon-${id}`),
    baseExperience: known?.baseExperience ?? 112,
    types: known?.types ?? ['electric'],
    spriteUrl: sprite(id),
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

export interface MockApiOptions {
  // Seeds a fresh, mutable copy of the trainer's team/favorites/profile for
  // this test — defaults to MOCK_TEAM / [] / MOCK_PROFILE. Passing an empty
  // team is how onboarding/empty-state E2E specs get a genuinely blank slate.
  team?: typeof MOCK_TEAM;
  favorites?: typeof MOCK_TEAM;
  profile?: typeof MOCK_PROFILE | null;
}

export async function mockApi(page: Page, options: MockApiOptions = {}): Promise<void> {
  let profile: typeof MOCK_PROFILE | null = options.profile === undefined ? { ...MOCK_PROFILE } : options.profile;
  let team = (options.team ?? MOCK_TEAM).map((m) => ({ ...m }));
  let favorites = (options.favorites ?? []).map((m) => ({ ...m }));
  const notesByPokemon = new Map<number, { id: number; pokemonId: number; text: string; createdAt: string }[]>();
  let noteIdSeq = 1;
  const battleHistory: any[] = [];
  let battleIdSeq = 1;

  function nextPosition(): number {
    return team.length === 0 ? 0 : Math.max(...team.map((m) => m.position)) + 1;
  }

  // ---- Profile ----
  await page.route(`${API_BASE}/profile`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (!profile) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'No profile found for this user.' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
      return;
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      profile = {
        ...(profile ?? MOCK_PROFILE),
        ...body,
        acceptedPolicy: true,
        acceptedPolicyAt: profile?.acceptedPolicyAt ?? '2026-01-01T00:00:00.000Z',
        policyVersion: profile?.policyVersion ?? 'v1',
        createdAt: profile?.createdAt ?? '2026-01-01T00:00:00.000Z',
        hasCompletedStarterQuiz: profile?.hasCompletedStarterQuiz ?? false,
        whosThatBestStreak: profile?.whosThatBestStreak ?? 0,
        ageRange: profile?.ageRange ?? '18-24',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
      return;
    }
    await route.continue();
  });

  await page.route(`${API_BASE}/profile/starter-quiz`, async (route) => {
    if (!profile) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    profile = { ...profile, hasCompletedStarterQuiz: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
  });

  await page.route(`${API_BASE}/profile/team-name`, async (route) => {
    const body = route.request().postDataJSON();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!profile || name.length < 2 || name.length > 40) {
      await route.fulfill({ status: name.length < 2 || name.length > 40 ? 400 : 404, contentType: 'application/json', body: JSON.stringify({ message: 'Team name must be 2-40 characters with no control characters.' }) });
      return;
    }
    profile = { ...profile, teamName: name };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
  });

  await page.route(`${API_BASE}/profile/whos-that-streak`, async (route) => {
    if (!profile) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const body = route.request().postDataJSON();
    profile = { ...profile, whosThatBestStreak: Math.max(profile.whosThatBestStreak, body.streak) };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
  });

  // ---- Team ----
  await page.route(`${API_BASE}/team/swap`, async (route) => {
    const body = route.request().postDataJSON();
    const toRemove = team.find((m) => m.pokemonId === body.removePokemonId);
    if (!toRemove) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not on team.' }) });
      return;
    }
    const detail = pokemonDetailFor(body.addPokemonId);
    team = team.filter((m) => m.pokemonId !== body.removePokemonId);
    team.push({ pokemonId: detail.id, pokemonName: detail.name, spriteUrl: detail.spriteUrl, addedAt: new Date().toISOString(), position: toRemove.position, stats: detail.stats.map((s) => ({ ...s })), types: detail.types, baseExperience: detail.baseExperience });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: `Swapped ${toRemove.pokemonName} for ${detail.name}!` }) });
  });

  await page.route(`${API_BASE}/team/reorder`, async (route) => {
    const body = route.request().postDataJSON();
    const ids: number[] = body.pokemonIds;
    team = ids.map((id, i) => ({ ...team.find((m) => m.pokemonId === id)!, position: i }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Team order saved.' }) });
  });

  await page.route(`${API_BASE}/team`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) });
      return;
    }
    if (method === 'PUT') {
      const body = route.request().postDataJSON();
      const ids: number[] = body.pokemonIds;
      team = ids.map((id, i) => {
        const existing = team.find((m) => m.pokemonId === id);
        if (existing) return { ...existing, position: i };
        const detail = pokemonDetailFor(id);
        return { pokemonId: detail.id, pokemonName: detail.name, spriteUrl: detail.spriteUrl, addedAt: new Date().toISOString(), position: i, stats: detail.stats.map((s) => ({ ...s })), types: detail.types, baseExperience: detail.baseExperience };
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) });
      return;
    }
    await route.continue();
  });

  await page.route(`${API_BASE}/team/*`, async (route) => {
    const method = route.request().method();
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    if (method === 'POST') {
      if (team.some((m) => m.pokemonId === id)) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ reason: 'DUPLICATE', message: 'Already on your team.' }) });
        return;
      }
      if (team.length >= 5) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ reason: 'TEAM_FULL', message: 'Your Dream Team is already full (5/5).' }) });
        return;
      }
      const detail = pokemonDetailFor(id);
      const member = { pokemonId: detail.id, pokemonName: detail.name, spriteUrl: detail.spriteUrl, addedAt: new Date().toISOString(), position: nextPosition(), stats: detail.stats.map((s) => ({ ...s })), types: detail.types, baseExperience: detail.baseExperience };
      team.push(member);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: `${detail.name} joined your Dream Team!`, member }) });
      return;
    }
    if (method === 'DELETE') {
      team = team.filter((m) => m.pokemonId !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.continue();
  });

  // ---- Favorites ----
  await page.route(`${API_BASE}/favorites`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(favorites) });
  });

  await page.route(`${API_BASE}/favorites/*`, async (route) => {
    const method = route.request().method();
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    if (method === 'POST') {
      if (!favorites.some((f) => f.pokemonId === id)) {
        const detail = pokemonDetailFor(id);
        favorites.push({ pokemonId: detail.id, pokemonName: detail.name, spriteUrl: detail.spriteUrl, addedAt: new Date().toISOString(), position: 0, stats: detail.stats.map((s) => ({ ...s })), types: detail.types, baseExperience: detail.baseExperience });
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'Added to favorites!' }) });
      return;
    }
    if (method === 'DELETE') {
      favorites = favorites.filter((f) => f.pokemonId !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.continue();
  });

  // ---- Notes ----
  await page.route(`${API_BASE}/notes/*`, async (route) => {
    const method = route.request().method();
    const idPart = Number(new URL(route.request().url()).pathname.split('/').pop());

    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notesByPokemon.get(idPart) ?? []) });
      return;
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const note = { id: noteIdSeq++, pokemonId: idPart, text: body.text, createdAt: new Date().toISOString() };
      notesByPokemon.set(idPart, [note, ...(notesByPokemon.get(idPart) ?? [])]);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(note) });
      return;
    }
    if (method === 'DELETE') {
      // idPart here is actually the note id, not a pokemon id.
      for (const [pokemonId, notes] of notesByPokemon.entries()) {
        notesByPokemon.set(pokemonId, notes.filter((n) => n.id !== idPart));
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.continue();
  });

  // ---- Assistant (mocked "AI" — deterministic canned answers, no real Gemini call) ----
  await page.route(`${API_BASE}/assistant/analyze`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'electric', reasoning: 'Your team leans electric — a Water-type pick would round out its coverage.', pokemon: toSummary(CATALOG.find((c) => c.id === 25)!) }) });
  });
  await page.route(`${API_BASE}/assistant/query`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'fire', reasoning: 'That description matches a Fire-type Pokémon well.', pokemon: toSummary(CATALOG.find((c) => c.id === 6)!) }) });
  });
  await page.route(`${API_BASE}/assistant/chat`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'You can build your Dream Team from the Explorer page!', pokemon: null }) });
  });
  await page.route(`${API_BASE}/assistant/team-name`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ names: ['Thunder Squad', 'Voltage Vanguard', 'Static Strikers'], source: 'ai' }) });
  });

  // ---- Avatar icons ----
  await page.route(`${API_BASE}/avatar-icons`, async (route) => {
    const icons = CATALOG.slice(0, 5).map((c) => ({ pokemonId: c.id, name: c.name, category: 'popular', spriteUrl: sprite(c.id) }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(icons) });
  });

  // ---- Battle History ----
  await page.route(`${API_BASE}/battle-history`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...battleHistory].reverse()) });
      return;
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const record = { id: battleIdSeq++, createdAt: new Date().toISOString(), ...body };
      battleHistory.push(record);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: record.id, createdAt: record.createdAt }) });
      return;
    }
    await route.continue();
  });

  // ---- Who's That Pokémon ----
  await page.route(`${API_BASE}/quiz/round`, async (route) => {
    const [target, ...rest] = CATALOG;
    const options = [target, ...rest.slice(0, 3)].map((c) => ({ id: c.id, name: c.name, types: c.types }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        target: { id: target.id, name: target.name, types: target.types, spriteUrl: sprite(target.id), baseExperience: target.baseExperience },
        options,
      }),
    });
  });

  // ---- Support ----
  await page.route(`${API_BASE}/support`, async (route) => {
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 1, createdAt: new Date().toISOString() }) });
  });

  // ---- Pokémon (search / detail / type-chart) ----
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
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const type = url.searchParams.get('type');
      const sort = url.searchParams.get('sort');
      const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1;
      const pageSize = 20;
      let results = CATALOG.filter((c) => (!search || c.name.includes(search)) && (!type || c.types.includes(type)));
      if (sort === 'strongest') results = [...results].sort((a, b) => b.baseExperience - a.baseExperience);
      else if (sort === 'id') results = [...results].sort((a, b) => a.id - b.id);
      else results = [...results].sort((a, b) => a.name.localeCompare(b.name));
      const total = results.length;
      const pageResults = results.slice((page - 1) * pageSize, page * pageSize);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: pageResults.map(toSummary), page, pageSize, total }),
      });
      return;
    }

    const idPart = path.split('/').pop() ?? '25';
    const id = Number.parseInt(idPart, 10) || 25;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pokemonDetailFor(id)) });
  });
}
