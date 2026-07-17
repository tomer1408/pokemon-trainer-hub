import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { Settings } from './settings';

describe('Settings', () => {
  let getProfileStrict: ReturnType<typeof vi.fn>;
  let saveProfile: ReturnType<typeof vi.fn>;
  let deleteAccount: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;

  function profile(overrides: Partial<TrainerProfile> = {}): TrainerProfile {
    return {
      trainerName: 'Ash',
      favoriteType: 'electric',
      experienceLevel: 'Beginner',
      firstName: 'Ash',
      lastName: 'Ketchum',
      dateOfBirth: '2000-01-01',
      country: 'Japan',
      avatarPokemonId: null,
      teamName: null,
      acceptedPolicy: true,
      acceptedPolicyAt: '2026-01-15T00:00:00.000Z',
      marketingEmailsOptIn: false,
      ...overrides,
    };
  }

  function setup(options: { profileError?: { status: number }; profile?: TrainerProfile } = {}) {
    getProfileStrict = vi.fn(() =>
      options.profileError ? throwError(() => options.profileError) : of(options.profile ?? profile()),
    );
    saveProfile = vi.fn(() => of(profile()));
    deleteAccount = vi.fn(() => of({ message: 'Your account and all your data have been deleted.' }));
    logout = vi.fn(() => of(undefined));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProfileService, useValue: { getProfileStrict, saveProfile, deleteAccount } },
        { provide: AuthService, useValue: { logout } },
      ],
    });
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the real profile and derives status "ok"', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.isLoading()).toBe(false);
    expect(inst.hasError()).toBe(false);
    expect(inst.hasNoProfile()).toBe(false);
    expect(inst.profile()?.trainerName).toBe('Ash');
  });

  it('derives status "missing" on a 404', () => {
    const fixture = setup({ profileError: { status: 404 } });
    const inst = fixture.componentInstance as any;
    expect(inst.hasNoProfile()).toBe(true);
    expect(inst.hasError()).toBe(false);
  });

  it('derives status "error" for any other failure', () => {
    const fixture = setup({ profileError: { status: 500 } });
    const inst = fixture.componentInstance as any;
    expect(inst.hasError()).toBe(true);
  });

  it('retry() re-fetches the profile', () => {
    const fixture = setup();
    fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(getProfileStrict).toHaveBeenCalledTimes(2);
  });

  it('seeds draftMarketing from the loaded profile', () => {
    const fixture = setup({ profile: profile({ marketingEmailsOptIn: true }) });
    expect((fixture.componentInstance as any).draftMarketing()).toBe(true);
  });

  it('toggleMarketing() flips the draft and isDirty() reflects the real difference', () => {
    const fixture = setup({ profile: profile({ marketingEmailsOptIn: false }) });
    const inst = fixture.componentInstance as any;
    expect(inst.isDirty()).toBe(false);

    fixture.componentInstance.toggleMarketing();

    expect(inst.draftMarketing()).toBe(true);
    expect(inst.isDirty()).toBe(true);
  });

  it('showPolicy()/closePolicy() control which policy modal is open', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.showPolicy('terms');
    expect(inst.openPolicyModal()).toBe('terms');
    fixture.componentInstance.closePolicy();
    expect(inst.openPolicyModal()).toBeNull();
  });

  it('saveSettings() is a no-op when nothing changed (not dirty)', () => {
    const fixture = setup();
    fixture.componentInstance.saveSettings();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('saveSettings() sends only the changed marketing flag and shows a saved toast on success', () => {
    vi.useFakeTimers();
    const fixture = setup({ profile: profile({ marketingEmailsOptIn: false }) });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.toggleMarketing();

    fixture.componentInstance.saveSettings();

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ marketingEmailsOptIn: true }));
    expect(inst.showSavedToast()).toBe(true);
    expect(inst.saving()).toBe(false);

    vi.advanceTimersByTime(2400);
    expect(inst.showSavedToast()).toBe(false);
    vi.useRealTimers();
  });

  it('saveSettings() surfaces a real error message on failure', () => {
    saveProfile = vi.fn(() => throwError(() => new Error('save failed')));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProfileService, useValue: { getProfileStrict: () => of(profile({ marketingEmailsOptIn: false })), saveProfile } },
        { provide: AuthService, useValue: { logout: vi.fn(() => of(undefined)) } },
      ],
    });
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.toggleMarketing();

    fixture.componentInstance.saveSettings();

    expect(inst.saveError()).toBe('Something went wrong saving your settings. Please try again.');
    expect(inst.saving()).toBe(false);
  });

  it('formattedAcceptedPolicyAt() formats the real acceptance date', () => {
    const withDate = setup({ profile: profile({ acceptedPolicyAt: '2026-01-15T00:00:00.000Z' }) });
    expect((withDate.componentInstance as any).formattedAcceptedPolicyAt()).toBe('January 15, 2026');
  });

  it('formattedAcceptedPolicyAt() is null if the policy was never accepted', () => {
    const withoutDate = setup({ profile: profile({ acceptedPolicyAt: undefined }) });
    expect((withoutDate.componentInstance as any).formattedAcceptedPolicyAt()).toBeNull();
  });

  it('logOut() clears the session-scoped starter-quiz skip and calls Auth0 logout', () => {
    sessionStorage.setItem('pth.starterQuizSkipped', 'true');
    const fixture = setup();

    fixture.componentInstance.logOut();

    expect(sessionStorage.getItem('pth.starterQuizSkipped')).toBeNull();
    expect(logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
  });

  it('requestDeleteAccount() opens the confirm dialog with a cleared text field', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    inst.deleteConfirmText.set('DELETE');
    fixture.componentInstance.requestDeleteAccount();

    expect(inst.showDeleteConfirm()).toBe(true);
    expect(inst.deleteConfirmText()).toBe('');
  });

  it('cancelDeleteAccount() closes the dialog without calling the API', () => {
    const fixture = setup();
    fixture.componentInstance.requestDeleteAccount();

    fixture.componentInstance.cancelDeleteAccount();

    expect((fixture.componentInstance as any).showDeleteConfirm()).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('canConfirmDelete() is only true once the exact word DELETE is typed', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    inst.deleteConfirmText.set('delete');
    expect(inst.canConfirmDelete()).toBe(false);

    inst.deleteConfirmText.set('DELET');
    expect(inst.canConfirmDelete()).toBe(false);

    inst.deleteConfirmText.set('DELETE');
    expect(inst.canConfirmDelete()).toBe(true);
  });

  it('confirmDeleteAccount() is a no-op until the confirm text is exactly DELETE', () => {
    const fixture = setup();
    (fixture.componentInstance as any).deleteConfirmText.set('nope');

    fixture.componentInstance.confirmDeleteAccount();

    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('confirmDeleteAccount() deletes the account then logs out, on success', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.deleteConfirmText.set('DELETE');

    fixture.componentInstance.confirmDeleteAccount();

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
  });

  it('confirmDeleteAccount() surfaces an error and does not log out, on failure', () => {
    deleteAccount = vi.fn(() => throwError(() => new Error('delete failed')));
    const localLogout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProfileService, useValue: { getProfileStrict: () => of(profile()), saveProfile, deleteAccount } },
        { provide: AuthService, useValue: { logout: localLogout } },
      ],
    });
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;
    inst.deleteConfirmText.set('DELETE');

    fixture.componentInstance.confirmDeleteAccount();

    expect(inst.deleteError()).toBe('Something went wrong deleting your account. Please try again.');
    expect(inst.deleting()).toBe(false);
    expect(localLogout).not.toHaveBeenCalled();
  });
});
