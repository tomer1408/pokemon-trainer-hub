// Whether a trainer has finished the Starter Quiz is now real, server-side
// state (TrainerProfile.hasCompletedStarterQuiz, via ProfileService) — tied
// to the actual logged-in user, not this browser. Only "did I skip it just
// now" still lives here, since that's deliberately session-scoped: it only
// needs to stop the redirect-to-quiz guard from looping on every Home visit
// within the same tab session, not persist across logins/devices. Home's
// own nudge banner reads the real server flag directly, so it keeps
// showing after a skip — only actually completing the quiz clears it.
const SKIPPED_KEY = 'pth.starterQuizSkipped';

export function hasSkippedStarterQuizThisSession(): boolean {
  try {
    return sessionStorage.getItem(SKIPPED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markStarterQuizSkipped(): void {
  try {
    sessionStorage.setItem(SKIPPED_KEY, 'true');
  } catch {
    // Safe failure mode — worst case the guard redirects to the quiz again.
  }
}
