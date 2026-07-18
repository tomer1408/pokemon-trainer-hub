import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService, Auth0ClientService, AuthState } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { ProfileService } from '../../core/profile';
import { Callback } from './callback';

describe('Callback', () => {
  let handleRedirectCallback: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  let getProfileStrict: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let loginWithRedirect: ReturnType<typeof vi.fn>;

  function setup(options: {
    redirectFails?: boolean;
    profileError?: { status: number; error?: unknown } | null;
  } = {}) {
    handleRedirectCallback = vi.fn(() =>
      options.redirectFails ? Promise.reject(new Error('bad code')) : Promise.resolve({}),
    );
    refresh = vi.fn();
    getProfileStrict = vi.fn(() =>
      options.profileError ? throwError(() => options.profileError) : of({ trainerName: 'Ash' } as any),
    );
    navigateByUrl = vi.fn();
    loginWithRedirect = vi.fn(() => of(undefined));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { loginWithRedirect } },
        { provide: Auth0ClientService, useValue: { handleRedirectCallback } },
        { provide: AuthState, useValue: { refresh } },
        { provide: ProfileService, useValue: { getProfileStrict } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });

    const fixture = TestBed.createComponent(Callback);
    fixture.detectChanges();
    return fixture;
  }

  it('navigates to /home once the code exchange and profile check both succeed', async () => {
    setup();
    await Promise.resolve();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('sets error-auth when the code exchange itself fails', async () => {
    const fixture = setup({ redirectFails: true });
    await Promise.resolve();
    await Promise.resolve();

    expect((fixture.componentInstance as any).state()).toBe('error-auth');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('navigates to /onboarding with profileConfirmedMissing state on a 404 (genuinely no profile)', async () => {
    setup({ profileError: { status: 404 } });
    await Promise.resolve();
    await Promise.resolve();

    expect(navigateByUrl).toHaveBeenCalledWith('/onboarding', { state: { profileConfirmedMissing: true } });
  });

  it('navigates to /restore-account on a real 403 ACCOUNT_DELETED, not the generic error-auth path', async () => {
    setup({ profileError: { status: 403, error: { code: 'ACCOUNT_DELETED', deletionType: 'self' } } });
    await Promise.resolve();
    await Promise.resolve();

    expect(navigateByUrl).toHaveBeenCalledWith('/restore-account');
  });

  it('sets error-auth (not error-profile) on a 401/403 — a bad token needs a fresh login, not a retried GET', async () => {
    const fixture = setup({ profileError: { status: 401 } });
    await Promise.resolve();
    await Promise.resolve();

    expect((fixture.componentInstance as any).state()).toBe('error-auth');
  });

  it('sets error-profile for any other profile-check failure', async () => {
    const fixture = setup({ profileError: { status: 500 } });
    await Promise.resolve();
    await Promise.resolve();

    expect((fixture.componentInstance as any).state()).toBe('error-profile');
  });

  it('retry() from error-auth restarts a fresh login (the single-use code cannot be replayed)', async () => {
    const fixture = setup({ redirectFails: true });
    await Promise.resolve();
    await Promise.resolve();

    fixture.componentInstance.retry();

    expect(loginWithRedirect).toHaveBeenCalled();
  });

  it('retry() from error-profile just repeats the plain profile GET', async () => {
    const fixture = setup({ profileError: { status: 500 } });
    await Promise.resolve();
    await Promise.resolve();
    getProfileStrict.mockReturnValue(of({ trainerName: 'Ash' } as any));

    fixture.componentInstance.retry();
    await Promise.resolve();

    expect(loginWithRedirect).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/home');
  });
});
