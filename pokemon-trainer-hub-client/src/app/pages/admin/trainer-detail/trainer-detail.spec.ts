import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminTrainersService, TrainerDetail } from '../../../core/admin-trainers';
import { AdminTrainerDetail } from './trainer-detail';

describe('AdminTrainerDetail', () => {
  let getDetail: ReturnType<typeof vi.fn>;
  let getAuth0Info: ReturnType<typeof vi.fn>;
  let deleteTrainer: ReturnType<typeof vi.fn>;

  function detail(overrides: Partial<TrainerDetail> = {}): TrainerDetail {
    return {
      profile: {
        auth0UserId: 'auth0|abc123',
        trainerName: 'Ash',
        country: 'Japan',
        ageRange: '18-24',
        favoriteType: 'electric',
        experienceLevel: 'Beginner',
        teamName: null,
        marketingEmailsOptIn: false,
        acceptedPolicy: true,
        acceptedPolicyAt: '2025-01-01T00:00:00.000Z',
        policyVersion: 'v1',
        hasCompletedStarterQuiz: true,
        whosThatBestStreak: 5,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      team: [],
      favoritesCount: 0,
      battles: { total: 0, wins: 0, losses: 0, difficultyBreakdown: {}, recent: [] },
      supportRequests: [],
      ...overrides,
    };
  }

  function setup(id = 'auth0|abc123') {
    getDetail = vi.fn(() => of(detail()));
    getAuth0Info = vi.fn(() => of({ email: 'ash@example.com' }));
    deleteTrainer = vi.fn(() => of({ message: 'Deleted.' }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: { getDetail, getAuth0Info, deleteTrainer } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the real detail for the id from the route', () => {
    const fixture = setup('auth0|abc123');
    const inst = fixture.componentInstance as any;

    expect(getDetail).toHaveBeenCalledWith('auth0|abc123');
    expect(inst.detail()?.profile.trainerName).toBe('Ash');
    expect(inst.loading()).toBe(false);
  });

  it('shows a real error state when the detail request fails', () => {
    getDetail = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: { getDetail, getAuth0Info, deleteTrainer } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'auth0|abc123' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).loadError()).toBe(true);
  });

  it('does not fetch real Auth0 info automatically — only on refreshAuth0Info()', () => {
    setup();
    expect(getAuth0Info).not.toHaveBeenCalled();
  });

  it('refreshAuth0Info() fetches and stores the real Auth0 data', () => {
    const fixture = setup();
    fixture.componentInstance.refreshAuth0Info();

    expect(getAuth0Info).toHaveBeenCalledWith('auth0|abc123');
    expect((fixture.componentInstance as any).auth0Info()?.email).toBe('ash@example.com');
  });

  it('refreshAuth0Info() surfaces a real error instead of crashing', () => {
    getAuth0Info = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: { getDetail, getAuth0Info, deleteTrainer } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'auth0|abc123' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();

    fixture.componentInstance.refreshAuth0Info();

    expect((fixture.componentInstance as any).auth0Error()).toBe('Could not reach Auth0 for this trainer.');
  });

  it('maskId() never returns the full raw Auth0 id', () => {
    const fixture = setup();
    expect(fixture.componentInstance.maskId('auth0|64f2b3c1a9d8e7f6')).not.toBe('auth0|64f2b3c1a9d8e7f6');
  });

  it('requestDelete()/cancelDelete() control the confirm dialog', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestDelete();
    expect(inst.showDeleteConfirm()).toBe(true);

    fixture.componentInstance.cancelDelete();
    expect(inst.showDeleteConfirm()).toBe(false);
  });

  it('confirmDelete() deletes the real trainer then navigates back to the list', () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.confirmDelete();

    expect(deleteTrainer).toHaveBeenCalledWith('auth0|abc123');
    expect(navigateSpy).toHaveBeenCalledWith(['/admin/trainers']);
  });

  it('confirmDelete() surfaces a real error and does not navigate away, on failure', () => {
    deleteTrainer = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: { getDetail, getAuth0Info, deleteTrainer } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'auth0|abc123' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.confirmDelete();

    const inst = fixture.componentInstance as any;
    expect(inst.deleteError()).toBe('Something went wrong deleting this trainer. Please try again.');
    expect(inst.deleting()).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('backToList() navigates to the trainers list', () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.backToList();

    expect(navigateSpy).toHaveBeenCalledWith(['/admin/trainers']);
  });
});
