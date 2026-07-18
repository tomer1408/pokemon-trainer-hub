import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProfileService, TrainerProfile } from '../core/profile';
import { onboardingGuard } from './onboarding-guard';

function baseProfile(): TrainerProfile {
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
    marketingEmailsOptIn: false,
  };
}

function setupGuard(
  getProfileStrict: () => ReturnType<ProfileService['getProfileStrict']>,
  navigationState?: Record<string, unknown>,
) {
  const parseUrl = vi.fn((url: string) => `parsed:${url}` as unknown as ReturnType<Router['parseUrl']>);
  const getCurrentNavigation = vi.fn(() =>
    navigationState === undefined ? null : ({ extras: { state: navigationState } } as never),
  );
  TestBed.configureTestingModule({
    providers: [
      { provide: ProfileService, useValue: { getProfileStrict } },
      { provide: Router, useValue: { parseUrl, getCurrentNavigation } },
    ],
  });
  return { parseUrl, getCurrentNavigation };
}

async function runGuard(): Promise<unknown> {
  return new Promise((resolve) => {
    const result = TestBed.runInInjectionContext(() => onboardingGuard({} as never, {} as never));
    if (result && typeof (result as any).subscribe === 'function') {
      (result as any).subscribe(resolve);
    } else {
      resolve(result);
    }
  });
}

describe('onboardingGuard', () => {
  it('trusts Callback\'s navigation state instead of re-checking the server', async () => {
    const getProfileStrict = vi.fn();
    setupGuard(getProfileStrict, { profileConfirmedMissing: true });

    const result = await runGuard();

    expect(result).toBe(true);
    expect(getProfileStrict).not.toHaveBeenCalled();
  });

  it('redirects to /home when a real profile already exists', async () => {
    const { parseUrl } = setupGuard(() => of(baseProfile()));

    const result = await runGuard();

    expect(parseUrl).toHaveBeenCalledWith('/home');
    expect(result).toBe('parsed:/home');
  });

  it('allows access when the server confirms no profile exists (404)', async () => {
    setupGuard(() => throwError(() => new Error('404')));

    const result = await runGuard();

    expect(result).toBe(true);
  });

  it('fails open (allows access) when there is no navigation state to trust and the check itself fails', async () => {
    setupGuard(() => throwError(() => new Error('network down')), undefined);

    const result = await runGuard();

    expect(result).toBe(true);
  });

  it('redirects to /restore-account on a real 403 ACCOUNT_DELETED, not fail-open', async () => {
    const err = { status: 403, error: { code: 'ACCOUNT_DELETED', deletionType: 'admin' } };
    const { parseUrl } = setupGuard(() => throwError(() => err), undefined);

    const result = await runGuard();

    expect(parseUrl).toHaveBeenCalledWith('/restore-account');
    expect(result).toBe('parsed:/restore-account');
  });
});
