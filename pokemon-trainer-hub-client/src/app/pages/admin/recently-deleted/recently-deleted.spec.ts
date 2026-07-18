import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminTrainersService, DeletedTrainerListItem } from '../../../core/admin-trainers';
import { AdminRecentlyDeleted } from './recently-deleted';

describe('AdminRecentlyDeleted', () => {
  let listDeleted: ReturnType<typeof vi.fn>;
  let restoreTrainer: ReturnType<typeof vi.fn>;
  let permanentlyDeleteTrainer: ReturnType<typeof vi.fn>;

  function item(overrides: Partial<DeletedTrainerListItem> = {}): DeletedTrainerListItem {
    return {
      auth0UserId: 'auth0|abc123',
      trainerName: 'Ash',
      deletedAt: '2026-07-01T00:00:00.000Z',
      purgeAt: '2026-07-31T00:00:00.000Z',
      deletedBy: 'auth0|admin-xyz',
      deletionType: 'admin',
      daysUntilPurge: 5,
      ...overrides,
    };
  }

  function setup() {
    listDeleted = vi.fn(() => of({ results: [item()], page: 1, pageSize: 10, total: 1 }));
    restoreTrainer = vi.fn(() => of({ message: 'Restored.' }));
    permanentlyDeleteTrainer = vi.fn(() => of({ message: 'Permanently deleted.' }));

    TestBed.configureTestingModule({
      providers: [{ provide: AdminTrainersService, useValue: { listDeleted, restoreTrainer, permanentlyDeleteTrainer } }],
    });
    const fixture = TestBed.createComponent(AdminRecentlyDeleted);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.useRealTimers());

  it('loads the real recently-deleted list on init', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    expect(listDeleted).toHaveBeenCalled();
    expect(inst.trainers().length).toBe(1);
    expect(inst.isLoading()).toBe(false);
  });

  it('shows a real error state when the list request fails', () => {
    listDeleted = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [{ provide: AdminTrainersService, useValue: { listDeleted, restoreTrainer, permanentlyDeleteTrainer } }],
    });
    const fixture = TestBed.createComponent(AdminRecentlyDeleted);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).loadError()).toBe(true);
  });

  it('deletionTypeVariant() distinguishes self- from admin-initiated deletions', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    expect(inst.deletionTypeVariant('admin')).toBe('error');
    expect(inst.deletionTypeVariant('self')).toBe('info');
  });

  it('requestRestore()/cancelRestore() control the confirm dialog', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    const target = item();

    fixture.componentInstance.requestRestore(target);
    expect(inst.restoreTarget()).toEqual(target);

    fixture.componentInstance.cancelRestore();
    expect(inst.restoreTarget()).toBeNull();
  });

  it('confirmRestore() restores the real target trainer and refetches the list', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestRestore(item());
    listDeleted.mockClear();

    fixture.componentInstance.confirmRestore();
    fixture.detectChanges();

    expect(restoreTrainer).toHaveBeenCalledWith('auth0|abc123');
    expect(inst.restoreTarget()).toBeNull();
    expect(listDeleted).toHaveBeenCalled();
  });

  it('confirmRestore() surfaces a real error and keeps the dialog open, on failure', () => {
    const fixture = setup();
    restoreTrainer.mockImplementationOnce(() => throwError(() => new Error('down')));
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestRestore(item());

    fixture.componentInstance.confirmRestore();

    expect(inst.restoreTarget()).toEqual(item());
    expect(inst.actionError()).toBeTruthy();
  });

  it('requestPermanentDelete()/cancelPermanentDelete() control the confirm dialog', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    const target = item();

    fixture.componentInstance.requestPermanentDelete(target);
    expect(inst.permanentDeleteTarget()).toEqual(target);

    fixture.componentInstance.cancelPermanentDelete();
    expect(inst.permanentDeleteTarget()).toBeNull();
  });

  it('confirmPermanentDelete() calls the real permanent-delete endpoint and refetches the list', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestPermanentDelete(item());
    listDeleted.mockClear();

    fixture.componentInstance.confirmPermanentDelete();
    fixture.detectChanges();

    expect(permanentlyDeleteTrainer).toHaveBeenCalledWith('auth0|abc123');
    expect(inst.permanentDeleteTarget()).toBeNull();
    expect(listDeleted).toHaveBeenCalled();
  });

  it('confirmPermanentDelete() surfaces a real error and keeps the dialog open, on failure', () => {
    const fixture = setup();
    permanentlyDeleteTrainer.mockImplementationOnce(() => throwError(() => new Error('down')));
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestPermanentDelete(item());

    fixture.componentInstance.confirmPermanentDelete();

    expect(inst.permanentDeleteTarget()).toEqual(item());
    expect(inst.actionError()).toBeTruthy();
  });

  it('debounces search input before refetching', () => {
    vi.useFakeTimers();
    const fixture = setup();
    listDeleted.mockClear();

    (fixture.componentInstance as any).searchInput.set('ash');
    expect(listDeleted).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect(listDeleted).toHaveBeenCalled();
    const lastCall = listDeleted.mock.calls[listDeleted.mock.calls.length - 1][0];
    expect(lastCall.search).toBe('ash');
  });

  it('maskId() never returns the full raw Auth0 id', () => {
    const fixture = setup();
    const masked = (fixture.componentInstance as any).maskId('auth0|64f2b3c1a9d8e7f6');
    expect(masked).not.toBe('auth0|64f2b3c1a9d8e7f6');
  });
});
