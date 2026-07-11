import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ProfileService } from '../core/profile';
import { hasSkippedStarterQuizThisSession } from './quiz/quiz-completion';

// Sends a trainer who hasn't finished (or explicitly skipped, this session)
// the Starter Quiz to /starter-quiz instead of straight into /home.
// "Completed" is checked against the real server-side TrainerProfile flag
// (not client storage), so it's tied to the actual logged-in user. Skipping
// only defers this for the current tab session — Home's own nudge banner
// still shows on every visit until the quiz is actually completed.
export const starterQuizGuard: CanActivateFn = () => {
  const profileService = inject(ProfileService);
  const router = inject(Router);

  if (hasSkippedStarterQuizThisSession()) return of(true);

  return profileService.getProfileStrict().pipe(
    map((profile) => (profile.hasCompletedStarterQuiz ? true : router.parseUrl('/starter-quiz'))),
    // Fail open — a transient profile-fetch hiccup shouldn't block Home entirely.
    catchError(() => of(true)),
  );
};
