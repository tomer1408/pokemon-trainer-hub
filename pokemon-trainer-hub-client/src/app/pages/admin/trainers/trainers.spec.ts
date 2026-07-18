import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminTrainersService } from '../../../core/admin-trainers';
import { AdminTrainers } from './trainers';

describe('AdminTrainers', () => {
  let list: ReturnType<typeof vi.fn>;

  function trainer(overrides = {}) {
    return {
      auth0UserId: 'auth0|abc123',
      trainerName: 'Ash',
      country: 'Japan',
      ageRange: '18-24',
      favoriteType: 'electric',
      hasCompletedStarterQuiz: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      teamSize: 3,
      favoritesCount: 5,
      battleCount: 2,
      ...overrides,
    };
  }

  function setup() {
    list = vi.fn(() => of({ results: [trainer()], page: 1, pageSize: 10, total: 1 }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminTrainersService, useValue: { list } }],
    });
    const fixture = TestBed.createComponent(AdminTrainers);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.useRealTimers());

  it('loads the first page on init', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    expect(list).toHaveBeenCalled();
    expect(inst.trainers().length).toBe(1);
    expect(inst.isLoading()).toBe(false);
  });

  it('shows a real error state when the list request fails', () => {
    list = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminTrainersService, useValue: { list } }],
    });
    const fixture = TestBed.createComponent(AdminTrainers);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).loadError()).toBe(true);
  });

  it('debounces search input before refetching', () => {
    vi.useFakeTimers();
    const fixture = setup();
    list.mockClear();

    (fixture.componentInstance as any).searchInput.set('ash');
    expect(list).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect(list).toHaveBeenCalled();
    const lastCall = list.mock.calls[list.mock.calls.length - 1][0];
    expect(lastCall.search).toBe('ash');
  });

  it('resets to page 1 when the search changes', () => {
    vi.useFakeTimers();
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.setPage(3);
    expect(inst.page()).toBe(3);

    // debouncedSearch (what the reset effect actually watches) only updates
    // once the 300ms debounce has elapsed — not on the raw searchInput write.
    inst.searchInput.set('misty');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(inst.page()).toBe(1);
  });

  it('maskId() never returns the full raw Auth0 id', () => {
    const fixture = setup();
    const masked = (fixture.componentInstance as any).maskId('auth0|64f2b3c1a9d8e7f6');
    expect(masked).not.toBe('auth0|64f2b3c1a9d8e7f6');
    expect(masked).toContain('auth0|');
  });

  it('openTrainer() navigates to the real trainer detail route', () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.openTrainer('auth0|abc123');

    expect(navigateSpy).toHaveBeenCalledWith(['/admin/trainers', 'auth0|abc123']);
  });
});
