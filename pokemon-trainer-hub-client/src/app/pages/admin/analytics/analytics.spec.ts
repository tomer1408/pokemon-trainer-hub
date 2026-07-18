import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminAnalyticsService, Analytics } from '../../../core/admin-analytics';
import { AdminAnalytics } from './analytics';

describe('AdminAnalytics', () => {
  function analytics(overrides: Partial<Analytics> = {}): Analytics {
    return {
      days: 30,
      overTime: { profiles: [{ date: '2026-07-01', count: 2 }], battles: [{ date: '2026-07-01', count: 1 }] },
      funnel: [
        { step: 'Trainer Profile Created', count: 10 },
        { step: 'Completed Starter Quiz', count: 8 },
        { step: 'Added ≥1 Team Member', count: 5 },
        { step: 'Completed Full Team (5/5)', count: 2 },
        { step: 'Fought ≥1 Battle', count: 1 },
      ],
      popularPokemon: {
        inTeams: [{ pokemonId: 25, pokemonName: 'pikachu', count: 4 }],
        favorited: [{ pokemonId: 6, pokemonName: 'charizard', count: 3 }],
      },
      battleStats: {
        results: [
          { label: 'win', count: 7 },
          { label: 'loss', count: 3 },
        ],
        byDifficulty: [{ label: 'Hard', count: 4 }],
        byOpponentType: [{ label: 'fire', count: 5 }],
      },
      whosThatStats: { averageBestStreak: 4.5, highestBestStreak: 12, trainersWhoHavePlayed: 9 },
      supportStats: { byTopic: [{ label: 'billing', count: 6 }], byStatus: [{ label: 'open', count: 3 }] },
      ...overrides,
    };
  }

  function setup(getAnalytics: () => ReturnType<AdminAnalyticsService['getAnalytics']>) {
    TestBed.configureTestingModule({
      providers: [{ provide: AdminAnalyticsService, useValue: { getAnalytics } }],
    });
    const fixture = TestBed.createComponent(AdminAnalytics);
    fixture.detectChanges();
    return fixture;
  }

  it('loads real analytics on init', () => {
    const fixture = setup(() => of(analytics()));
    const inst = fixture.componentInstance as any;

    expect(inst.isLoading()).toBe(false);
    expect(inst.loadError()).toBe(false);
    expect(inst.analytics()?.funnel.length).toBe(5);
  });

  it('shows a real error state when the request fails', () => {
    const fixture = setup(() => throwError(() => new Error('down')));
    const inst = fixture.componentInstance as any;

    expect(inst.loadError()).toBe(true);
  });

  it('funnelRows computes real pct-of-first and drop-from-previous from the real counts', () => {
    const fixture = setup(() => of(analytics()));
    const rows = (fixture.componentInstance as any).funnelRows();

    expect(rows[0].pct).toBe(100);
    expect(rows[0].dropFromPrevious).toBeNull();
    expect(rows[1].pct).toBe(80);
    expect(rows[1].dropFromPrevious).toBe(2);
    expect(rows[4].dropFromPrevious).toBe(1);
  });

  it('resultSegments maps real win/loss counts to donut segments with distinct colors', () => {
    const fixture = setup(() => of(analytics()));
    const segments = (fixture.componentInstance as any).resultSegments();

    expect(segments.find((s: any) => s.label === 'win').count).toBe(7);
    expect(segments.find((s: any) => s.label === 'loss').colorVar).toBe('var(--danger)');
  });

  it('popularInTeamsItems/popularFavoritedItems map pokemonName to label for HBarList', () => {
    const fixture = setup(() => of(analytics()));
    const inst = fixture.componentInstance as any;

    expect(inst.popularInTeamsItems()).toEqual([{ label: 'pikachu', count: 4 }]);
    expect(inst.popularFavoritedItems()).toEqual([{ label: 'charizard', count: 3 }]);
  });

  it('setDays() refetches with the real selected window', () => {
    const getAnalytics = vi.fn(() => of(analytics()));
    const fixture = setup(getAnalytics);
    getAnalytics.mockClear();

    fixture.componentInstance.setDays(90);
    fixture.detectChanges();

    expect(getAnalytics).toHaveBeenCalledWith(90);
  });
});
