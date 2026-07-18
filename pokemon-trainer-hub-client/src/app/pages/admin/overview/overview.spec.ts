import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminOverviewService, Overview } from '../../../core/admin-overview';
import { AdminOverview } from './overview';

describe('AdminOverview', () => {
  function overview(overrides: Partial<Overview> = {}): Overview {
    return {
      kpis: {
        totalTrainers: 10,
        newTrainersLast7Days: 2,
        openSupportRequests: 3,
        quizCompletedCount: 7,
        trainersWithTeamCount: 5,
        fullTeamsCount: 1,
        battlesLast7Days: 4,
      },
      recentSupportRequests: [
        { id: 1, name: 'Misty', topic: 'bug', status: 'open', priority: 'high', createdAt: '2026-07-01T00:00:00.000Z' },
      ],
      recentActivity: [
        {
          type: 'team_member_added',
          auth0UserId: 'auth0|a',
          detail: 'Pikachu',
          trainerName: 'Ash',
          createdAt: '2026-07-10T00:00:00.000Z',
        },
      ],
      ...overrides,
    };
  }

  function setup(getOverview: () => ReturnType<AdminOverviewService['getOverview']>) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminOverviewService, useValue: { getOverview } }],
    });
    const fixture = TestBed.createComponent(AdminOverview);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the real overview and builds 7 real KPI cards from it', () => {
    const fixture = setup(() => of(overview()));
    const inst = fixture.componentInstance as any;

    expect(inst.isLoading()).toBe(false);
    expect(inst.loadError()).toBe(false);
    expect(inst.kpiCards().length).toBe(7);
    expect(inst.kpiCards()[0].value).toBe(10);
  });

  it('shows a real error state when the request fails', () => {
    const fixture = setup(() => throwError(() => new Error('down')));
    const inst = fixture.componentInstance as any;

    expect(inst.isLoading()).toBe(false);
    expect(inst.loadError()).toBe(true);
    expect(inst.overview()).toBeNull();
  });

  it('formats each real activity event type into readable text', () => {
    const fixture = setup(() => of(overview()));
    const inst = fixture.componentInstance as any;

    expect(inst.activityText({ type: 'trainer_joined', trainerName: 'Ash', detail: '', auth0UserId: '', createdAt: '' })).toContain('Ash');
    expect(
      inst.activityText({ type: 'team_member_added', trainerName: 'Ash', detail: 'Pikachu', auth0UserId: '', createdAt: '' }),
    ).toContain('Pikachu');
    expect(
      inst.activityText({ type: 'battle_completed', trainerName: 'Ash', detail: 'win vs Gary', auth0UserId: '', createdAt: '' }),
    ).toContain('win vs Gary');
    expect(
      inst.activityText({ type: 'support_request_created', trainerName: 'Ash', detail: 'billing', auth0UserId: '', createdAt: '' }),
    ).toContain('billing');
  });

  it('goToSupport() navigates to the real Support Requests page', () => {
    const fixture = setup(() => of(overview()));
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.goToSupport();

    expect(navigateSpy).toHaveBeenCalledWith(['/admin/support']);
  });
});
