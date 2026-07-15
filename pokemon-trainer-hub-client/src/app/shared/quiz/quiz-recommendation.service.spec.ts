import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PokemonListResponse, PokemonService, PokemonSummary } from '../../core/pokemon';
import { QuizPreferenceProfile } from './quiz-preferences';
import {
  NormalizationMetadata,
  ScoredPokemon,
  ScoringPokemon,
  QuizRecommendationService,
  buildNormalizationMetadata,
  calculateBalancedBonus,
  calculateMatchScore,
  calculateMaxPossibleScore,
  calculateStatScore,
  calculateTypeScore,
  filterExistingTeamMembers,
  prepareScoringPokemon,
} from './quiz-recommendation.service';

function emptyProfile(): QuizPreferenceProfile {
  return { types: {}, stats: {}, style: {} };
}

function mockPokemon(
  id: number,
  overrides: { types?: string[]; baseExperience?: number; spriteUrl?: string; stats?: Record<string, number> } = {},
): PokemonSummary {
  const statsMap = { hp: 50, attack: 50, defense: 50, speed: 50, 'special-attack': 50, ...overrides.stats };
  return {
    id,
    name: `mon-${id}`,
    baseExperience: overrides.baseExperience ?? 100,
    types: overrides.types ?? ['normal'],
    spriteUrl: overrides.spriteUrl ?? `sprite-${id}`,
    stats: Object.entries(statsMap).map(([name, value]) => ({ name, value })),
  };
}

// Mirrors how GET /api/pokemon?sort=id actually paginates: page N holds ids
// (N-1)*20+1..N*20 across the whole PokeAPI dataset; the service's own
// id<=151 filter is what trims page 8 down to just 141-151.
function buildMockPages(
  customize?: (id: number) => Parameters<typeof mockPokemon>[1],
): PokemonListResponse[] {
  const pages: PokemonListResponse[] = [];
  for (let page = 1; page <= 8; page++) {
    const start = (page - 1) * 20 + 1;
    const end = page * 20;
    const results: PokemonSummary[] = [];
    for (let id = start; id <= end; id++) {
      results.push(mockPokemon(id, customize?.(id)));
    }
    pages.push({ results, page, pageSize: 20, total: 160 });
  }
  return pages;
}

function setupService(pages: PokemonListResponse[]) {
  const search = vi.fn((params: { page?: number }) => of(pages[(params.page ?? 1) - 1]));
  TestBed.configureTestingModule({
    providers: [{ provide: PokemonService, useValue: { search } }],
  });
  return { service: TestBed.inject(QuizRecommendationService), search };
}

describe('QuizRecommendationService.getRecommendations', () => {
  it('produces identical recommendations for identical inputs (deterministic)', () => {
    const pages = buildMockPages((id) => ({ types: id % 2 === 0 ? ['fire'] : ['water'], stats: { attack: id } }));
    const { service } = setupService(pages);
    const profile: QuizPreferenceProfile = { types: { fire: 3 }, stats: { attack: 2 }, style: {} };

    let first: ScoredPokemon[] = [];
    let second: ScoredPokemon[] = [];
    service.getRecommendations(profile).subscribe((r) => (first = r));
    service.getRecommendations(profile).subscribe((r) => (second = r));

    expect(second).toEqual(first);
  });

  it('keeps match scores between 0 and 100', () => {
    const pages = buildMockPages((id) => ({ stats: { attack: (id * 2) % 160 } }));
    const { service } = setupService(pages);
    const profile: QuizPreferenceProfile = { types: {}, stats: { attack: 5 }, style: {} };

    let recs: ScoredPokemon[] = [];
    service.getRecommendations(profile).subscribe((r) => (recs = r));
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.matchPercent).toBeGreaterThanOrEqual(0);
      expect(r.matchPercent).toBeLessThanOrEqual(100);
    }
  });

  it('does not artificially floor match scores at 60', () => {
    // Nobody matches the user's stated "attack" preference at all (every
    // candidate keeps the mockPokemon default of 50) — under the old
    // "60 + ratio*39" formula the single top-ranked candidate would always
    // show 99%, no matter how weak the actual fit was.
    const pages = buildMockPages();
    const { service } = setupService(pages);
    const profile: QuizPreferenceProfile = { types: {}, stats: { attack: 5 }, style: {} };

    let recs: ScoredPokemon[] = [];
    service.getRecommendations(profile).subscribe((r) => (recs = r));
    expect(recs[0].matchPercent).toBeLessThan(60);
  });

  it('excludes Pokémon already on the current team', () => {
    const pages = buildMockPages();
    const { service } = setupService(pages);

    let recs: ScoredPokemon[] = [];
    service.getRecommendations(emptyProfile(), [1, 2, 3]).subscribe((r) => (recs = r));
    const recommendedIds = recs.map((r) => r.pokemon.id);
    expect(recommendedIds).not.toContain(1);
    expect(recommendedIds).not.toContain(2);
    expect(recommendedIds).not.toContain(3);
  });

  it('still returns three recommendations for an empty team', () => {
    const pages = buildMockPages();
    const { service } = setupService(pages);
    let recs: ScoredPokemon[] = [];
    service.getRecommendations(emptyProfile(), []).subscribe((r) => (recs = r));
    expect(recs.length).toBe(3);
  });

  it('still returns three recommendations when a full 5-member team is excluded', () => {
    const pages = buildMockPages();
    const { service } = setupService(pages);
    let recs: ScoredPokemon[] = [];
    service.getRecommendations(emptyProfile(), [1, 2, 3, 4, 5]).subscribe((r) => (recs = r));
    expect(recs.length).toBe(3);
  });

  it('breaks ties deterministically by Pokémon id when every candidate scores identically', () => {
    const pages = buildMockPages(() => ({ types: ['normal'], stats: { attack: 50 }, baseExperience: 100 }));
    const { service } = setupService(pages);
    let recs: ScoredPokemon[] = [];
    service.getRecommendations(emptyProfile()).subscribe((r) => (recs = r));
    expect(recs.map((r) => r.pokemon.id)).toEqual([1, 2, 3]);
  });
});

describe('QuizRecommendationService — shared dataset cache & resilience', () => {
  it('reuses the cached dataset across multiple getRecommendations calls (no duplicate HTTP requests)', () => {
    const pages = buildMockPages();
    const { service, search } = setupService(pages);
    service.getRecommendations(emptyProfile()).subscribe();
    service.getRecommendations(emptyProfile()).subscribe();
    expect(search).toHaveBeenCalledTimes(8);
  });

  it('reuses the dataset started by prefetchGen1Pool() once the quiz finishes (retake behavior)', () => {
    const pages = buildMockPages();
    const { service, search } = setupService(pages);
    service.prefetchGen1Pool(); // e.g. called from startQuiz()
    let recs: ScoredPokemon[] = [];
    service.getRecommendations(emptyProfile()).subscribe((r) => (recs = r));
    expect(search).toHaveBeenCalledTimes(8);
    expect(recs.length).toBe(3);
  });

  it('does not start a second request for concurrent callers', () => {
    const pages = buildMockPages();
    const { service, search } = setupService(pages);
    service.getRecommendations(emptyProfile()).subscribe();
    service.getRecommendations(emptyProfile()).subscribe();
    service.getRecommendations(emptyProfile()).subscribe();
    expect(search).toHaveBeenCalledTimes(8);
  });

  it('allows a retry after a complete load failure instead of permanently caching the error', () => {
    const fullPages = buildMockPages();
    let attempt = 0;
    const search = vi.fn((params: { page?: number }) => {
      const page = params.page ?? 1;
      if (attempt < 8) {
        attempt++;
        return of({ results: [], page, pageSize: 20, total: 0 });
      }
      return of(fullPages[page - 1]);
    });
    TestBed.configureTestingModule({ providers: [{ provide: PokemonService, useValue: { search } }] });
    const service = TestBed.inject(QuizRecommendationService);

    let firstError: unknown = null;
    service.getRecommendations(emptyProfile()).subscribe({ error: (e) => (firstError = e) });
    expect(firstError).toBeTruthy();

    let recs: ScoredPokemon[] = [];
    service.getRecommendations(emptyProfile()).subscribe((r) => (recs = r));
    expect(recs.length).toBe(3);
  });

  it('does not discard all results when only some pages come back empty but enough candidates remain', () => {
    const pages = buildMockPages();
    // 2 of 8 pages "fail" (PokemonService.search() already degrades a page
    // failure into an empty-but-successful result) — the other 6 pages
    // still comfortably clear MIN_VALID_CANDIDATES.
    pages[3] = { results: [], page: 4, pageSize: 20, total: 0 };
    pages[6] = { results: [], page: 7, pageSize: 20, total: 0 };
    const { service } = setupService(pages);

    let recs: ScoredPokemon[] = [];
    service.getRecommendations(emptyProfile()).subscribe((r) => (recs = r));
    expect(recs.length).toBe(3);
  });

  it('treats too few surviving candidates as a failure instead of silently recommending from a tiny pool', () => {
    const emptyPages: PokemonListResponse[] = Array.from({ length: 8 }, (_, i) => ({
      results: [],
      page: i + 1,
      pageSize: 20,
      total: 0,
    }));
    emptyPages[0] = buildMockPages()[0]; // only 20 real candidates survive — below MIN_VALID_CANDIDATES
    const { service } = setupService(emptyPages);

    let error: unknown = null;
    service.getRecommendations(emptyProfile()).subscribe({ error: (e) => (error = e) });
    expect(error).toBeTruthy();
  });
});

describe('calculateTypeScore (dual-type contribution)', () => {
  it('gives a dual-type Pokémon a controlled advantage, not double credit', () => {
    const single = calculateTypeScore(['fire'], { fire: 1 }).contribution;
    const dual = calculateTypeScore(['fire', 'water'], { fire: 1, water: 1 }).contribution;
    expect(dual).toBeGreaterThan(single);
    expect(dual).toBeLessThan(single * 2);
    expect(dual).toBeCloseTo(single * 1.5);
  });

  it('returns 0 when neither type matches any preference', () => {
    expect(calculateTypeScore(['ghost', 'poison'], { fire: 1 }).contribution).toBe(0);
  });
});

describe('calculateStatScore', () => {
  const base: ScoringPokemon = {
    id: 1,
    name: 'a',
    spriteUrl: null,
    types: ['fire'],
    hp: 50,
    attack: 50,
    defense: 50,
    speed: 50,
    specialAttack: 50,
    baseExperience: 100,
  };
  const range = { min: 0, max: 200 };
  const metadata: NormalizationMetadata = {
    hp: range,
    attack: range,
    defense: range,
    speed: range,
    specialAttack: range,
    baseExperience: { min: 0, max: 5000 },
  };

  it('scores a Pokémon with a strong preferred stat higher than a weak one', () => {
    const strong = { ...base, attack: 140 };
    const weak = { ...base, id: 2, attack: 20 };
    const weights = { attack: 1 };
    expect(calculateStatScore(strong, weights, metadata).contribution).toBeGreaterThan(
      calculateStatScore(weak, weights, metadata).contribution,
    );
  });

  it('does not let baseExperience dominate the other components', () => {
    const hugeXp = { ...base, baseExperience: 5000 };
    const contribution = calculateStatScore(hugeXp, { baseExperience: 1 }, metadata).contribution;
    // Capped by the min-max-normalized value (clamped to 1) times the 0-1
    // weight times the shared 100-point scale — never runs away unbounded.
    expect(contribution).toBeLessThanOrEqual(100);
  });

  it('normalizes against the real pool spread instead of a fixed ceiling', () => {
    // A stat of 120 out of a real pool range of 100-140 is near the top of
    // what Gen 1 actually offers, even though 120 would look mediocre
    // against an arbitrary fixed ceiling like /150.
    const narrowRange = { min: 100, max: 140 };
    const narrowMetadata: NormalizationMetadata = { ...metadata, attack: narrowRange };
    const pokemon = { ...base, attack: 120 };
    const { contribution } = calculateStatScore(pokemon, { attack: 1 }, narrowMetadata);
    expect(contribution).toBeGreaterThan(40); // (120-100)/(140-100) = 0.5 -> 50 pts
  });

  it('falls back safely to a neutral value when every Pokémon shares the same stat (min === max)', () => {
    const degenerate: NormalizationMetadata = { ...metadata, attack: { min: 80, max: 80 } };
    expect(() => calculateStatScore(base, { attack: 1 }, degenerate)).not.toThrow();
    const { contribution } = calculateStatScore(base, { attack: 1 }, degenerate);
    expect(Number.isFinite(contribution)).toBe(true);
  });
});

describe('calculateBalancedBonus', () => {
  const flat = (value: number): ScoringPokemon => ({
    id: 1,
    name: 'a',
    spriteUrl: null,
    types: [],
    hp: value,
    attack: value,
    defense: value,
    speed: value,
    specialAttack: value,
    baseExperience: 100,
  });

  it('rewards an even stat spread over a large one, for the same weight', () => {
    const even = flat(60);
    const uneven = { ...flat(60), hp: 10, attack: 150 };
    expect(calculateBalancedBonus(even, 1)).toBeGreaterThan(calculateBalancedBonus(uneven, 1));
  });

  it('returns 0 when the user has no balanced-style preference', () => {
    expect(calculateBalancedBonus(flat(60), 0)).toBe(0);
  });
});

describe('calculateMatchScore', () => {
  it('clamps to 0-100', () => {
    expect(calculateMatchScore(-50, 100)).toBe(0);
    expect(calculateMatchScore(500, 100)).toBe(100);
  });

  it('is deterministic for identical inputs', () => {
    expect(calculateMatchScore(42, 100)).toBe(calculateMatchScore(42, 100));
  });

  it('never divides by zero', () => {
    expect(Number.isFinite(calculateMatchScore(10, 0))).toBe(true);
  });
});

describe('calculateMaxPossibleScore', () => {
  it('only counts categories the profile actually engaged', () => {
    expect(calculateMaxPossibleScore({ types: { fire: 1 }, stats: {}, style: {} })).toBe(100);
    expect(calculateMaxPossibleScore({ types: { fire: 1 }, stats: { attack: 1 }, style: {} })).toBe(200);
  });

  it('never returns 0, even for a fully empty profile', () => {
    expect(calculateMaxPossibleScore(emptyProfile())).toBeGreaterThan(0);
  });
});

describe('filterExistingTeamMembers', () => {
  it('removes ids present on the team', () => {
    const pool = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(filterExistingTeamMembers(pool, [2])).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('returns the pool unchanged for an empty team', () => {
    const pool = [{ id: 1 }, { id: 2 }];
    expect(filterExistingTeamMembers(pool, [])).toEqual(pool);
  });
});

describe('buildNormalizationMetadata', () => {
  it('computes the real min/max per stat across the pool', () => {
    const pool: ScoringPokemon[] = [
      { id: 1, name: 'a', spriteUrl: null, types: [], hp: 10, attack: 30, defense: 40, speed: 50, specialAttack: 20, baseExperience: 60 },
      { id: 2, name: 'b', spriteUrl: null, types: [], hp: 90, attack: 70, defense: 45, speed: 5, specialAttack: 100, baseExperience: 300 },
    ];
    const metadata = buildNormalizationMetadata(pool);
    expect(metadata.hp).toEqual({ min: 10, max: 90 });
    expect(metadata.speed).toEqual({ min: 5, max: 50 });
    expect(metadata.baseExperience).toEqual({ min: 60, max: 300 });
  });
});

describe('prepareScoringPokemon', () => {
  it('maps PokeAPI stat names onto compact fields', () => {
    const p = mockPokemon(25, { stats: { hp: 35, attack: 55, defense: 40, speed: 90, 'special-attack': 50 } });
    const compact = prepareScoringPokemon(p);
    expect(compact).toMatchObject({ id: 25, hp: 35, attack: 55, defense: 40, speed: 90, specialAttack: 50 });
  });

  it('defaults a missing stat to 0 instead of throwing', () => {
    const p = { ...mockPokemon(1), stats: [] };
    expect(() => prepareScoringPokemon(p)).not.toThrow();
    expect(prepareScoringPokemon(p).hp).toBe(0);
  });
});
