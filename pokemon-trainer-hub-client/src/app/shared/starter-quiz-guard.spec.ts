import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProfileService, TrainerProfile } from '../core/profile';
import { starterQuizGuard } from './starter-quiz-guard';
import { markStarterQuizSkipped } from './quiz/quiz-completion';

function baseProfile(overrides: Partial<TrainerProfile> = {}): TrainerProfile {
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
    hasCompletedStarterQuiz: false,
    ...overrides,
  };
}

function setupGuard(getProfileStrict: () => ReturnType<ProfileService['getProfileStrict']>) {
  const parseUrl = vi.fn((url: string) => `parsed:${url}` as unknown as ReturnType<Router['parseUrl']>);
  TestBed.configureTestingModule({
    providers: [
      { provide: ProfileService, useValue: { getProfileStrict } },
      { provide: Router, useValue: { parseUrl } },
    ],
  });
  return { parseUrl };
}

async function runGuard(): Promise<unknown> {
  return new Promise((resolve) => {
    const result = TestBed.runInInjectionContext(() => starterQuizGuard({} as never, {} as never));
    if (result && typeof (result as any).subscribe === 'function') {
      (result as any).subscribe(resolve);
    } else {
      resolve(result);
    }
  });
}

describe('starterQuizGuard', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('allows access without checking the server when the quiz was already skipped this session', async () => {
    markStarterQuizSkipped();
    const getProfileStrict = vi.fn();
    setupGuard(getProfileStrict);

    const result = await runGuard();

    expect(result).toBe(true);
    expect(getProfileStrict).not.toHaveBeenCalled();
  });

  it('allows access when the server confirms the quiz is completed', async () => {
    setupGuard(() => of(baseProfile({ hasCompletedStarterQuiz: true })));

    const result = await runGuard();

    expect(result).toBe(true);
  });

  it('redirects to /starter-quiz when the server says it is not completed', async () => {
    const { parseUrl } = setupGuard(() => of(baseProfile({ hasCompletedStarterQuiz: false })));

    const result = await runGuard();

    expect(parseUrl).toHaveBeenCalledWith('/starter-quiz');
    expect(result).toBe('parsed:/starter-quiz');
  });

  it('fails open (allows access) when the profile fetch errors', async () => {
    setupGuard(() => throwError(() => new Error('network down')));

    const result = await runGuard();

    expect(result).toBe(true);
  });
});
