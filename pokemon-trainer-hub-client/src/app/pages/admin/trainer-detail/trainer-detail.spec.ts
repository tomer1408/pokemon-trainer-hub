import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminTrainersService, TrainerDetail } from '../../../core/admin-trainers';
import { AdminTrainerDetail } from './trainer-detail';

describe('AdminTrainerDetail', () => {
  let getDetail: ReturnType<typeof vi.fn>;
  let getAuth0Info: ReturnType<typeof vi.fn>;
  let deleteTrainer: ReturnType<typeof vi.fn>;
  let restoreTrainer: ReturnType<typeof vi.fn>;
  let permanentlyDeleteTrainer: ReturnType<typeof vi.fn>;

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
        deletedAt: null,
        purgeAt: null,
        deletedBy: null,
        deletionType: null,
      },
      team: [],
      favoritesCount: 0,
      battles: { total: 0, wins: 0, losses: 0, difficultyBreakdown: {}, recent: [] },
      supportRequests: [],
      ...overrides,
    };
  }

  function deletedDetail(deletionType: 'self' | 'admin' = 'admin'): TrainerDetail {
    const base = detail();
    return {
      ...base,
      profile: {
        ...base.profile,
        deletedAt: '2026-07-01T00:00:00.000Z',
        purgeAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        deletedBy: deletionType === 'self' ? 'auth0|abc123' : 'auth0|admin-xyz',
        deletionType,
      },
    };
  }

  function providers() {
    return { getDetail, getAuth0Info, deleteTrainer, restoreTrainer, permanentlyDeleteTrainer };
  }

  function setup(id = 'auth0|abc123') {
    getDetail = vi.fn(() => of(detail()));
    getAuth0Info = vi.fn(() => of({ email: 'ash@example.com' }));
    deleteTrainer = vi.fn(() => of({ message: 'Deleted.' }));
    restoreTrainer = vi.fn(() => of({ message: 'Restored.' }));
    permanentlyDeleteTrainer = vi.fn(() => of({ message: 'Permanently deleted.' }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: providers() },
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
        { provide: AdminTrainersService, useValue: providers() },
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
        { provide: AdminTrainersService, useValue: providers() },
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
        { provide: AdminTrainersService, useValue: providers() },
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

  it('isDeleted() is false for an active trainer', () => {
    const fixture = setup();
    expect((fixture.componentInstance as any).isDeleted()).toBe(false);
  });

  it('isDeleted() is true for a soft-deleted trainer', () => {
    getDetail = vi.fn(() => of(deletedDetail()));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: providers() },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'auth0|abc123' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).isDeleted()).toBe(true);
  });

  it('daysUntilPurge() computes a real value from the real purgeAt, never a hardcoded 30', () => {
    getDetail = vi.fn(() => of(deletedDetail()));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: providers() },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'auth0|abc123' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).daysUntilPurge()).toBe(3);
  });

  it('requestPermanentDelete()/cancelPermanentDelete() control the confirm dialog', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestPermanentDelete();
    expect(inst.showPermanentDeleteConfirm()).toBe(true);

    fixture.componentInstance.cancelPermanentDelete();
    expect(inst.showPermanentDeleteConfirm()).toBe(false);
  });

  it('confirmPermanentDelete() calls the real, unmodified deleteAccount path then navigates back to the list', () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.confirmPermanentDelete();

    expect(permanentlyDeleteTrainer).toHaveBeenCalledWith('auth0|abc123');
    expect(navigateSpy).toHaveBeenCalledWith(['/admin/trainers']);
  });

  it('confirmPermanentDelete() surfaces a real error and does not navigate away, on failure', () => {
    permanentlyDeleteTrainer = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: providers() },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'auth0|abc123' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.confirmPermanentDelete();

    const inst = fixture.componentInstance as any;
    expect(inst.permanentDeleteError()).toBeTruthy();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('requestRestore()/cancelRestore() control the confirm dialog', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestRestore();
    expect(inst.showRestoreConfirm()).toBe(true);

    fixture.componentInstance.cancelRestore();
    expect(inst.showRestoreConfirm()).toBe(false);
  });

  it('confirmRestore() restores the real trainer then reloads the real detail from the server', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.confirmRestore();

    expect(restoreTrainer).toHaveBeenCalledWith('auth0|abc123');
    expect(inst.showRestoreConfirm()).toBe(false);
    expect(getDetail.mock.calls.length).toBe(2); // once on init, once after restore
  });

  it('confirmRestore() surfaces a real error and keeps the dialog open, on failure', () => {
    restoreTrainer = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminTrainersService, useValue: providers() },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'auth0|abc123' })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminTrainerDetail);
    fixture.detectChanges();

    fixture.componentInstance.confirmRestore();

    const inst = fixture.componentInstance as any;
    expect(inst.restoreError()).toBeTruthy();
    expect(inst.restoring()).toBe(false);
  });

  it('backToList() navigates to the trainers list', () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.backToList();

    expect(navigateSpy).toHaveBeenCalledWith(['/admin/trainers']);
  });
});
