import { Routes } from '@angular/router';
import { authGuardFn } from '@auth0/auth0-angular';
import { onboardingGuard } from './shared/onboarding-guard';
import { starterQuizGuard } from './shared/starter-quiz-guard';

// Every route below (except '' and 'callback') is wrapped in authGuardFn — the
// SDK's official guard, which redirects unauthenticated visitors straight to
// Auth0 login instead of just hiding UI.
//
// NOTE: most pages below still point at the generic Placeholder component.
// Each one gets swapped for its real page one at a time as we build it —
// see /Users/tomerrozental/.claude/plans/hazy-soaring-finch.md.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'callback',
    loadComponent: () => import('./pages/callback/callback').then((m) => m.Callback),
  },
  {
    path: 'onboarding',
    canActivate: [authGuardFn, onboardingGuard],
    loadComponent: () => import('./pages/onboarding/onboarding').then((m) => m.Onboarding),
  },
  {
    path: 'home',
    canActivate: [authGuardFn, starterQuizGuard],
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'explorer',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/explorer/explorer').then((m) => m.Explorer),
  },
  {
    path: 'my-team',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/my-team/my-team').then((m) => m.MyTeam),
  },
  {
    path: 'manage-team',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/manage-team/manage-team').then((m) => m.ManageTeam),
  },
  {
    path: 'profile',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
  },
  {
    path: 'ai-assistant',
    canActivate: [authGuardFn],
    loadComponent: () =>
      import('./pages/ai-trainer-assistant/ai-trainer-assistant').then((m) => m.AiTrainerAssistant),
  },
  {
    path: 'battle',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/battle/battle').then((m) => m.Battle),
  },
  {
    path: 'starter-quiz',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/starter-quiz/starter-quiz').then((m) => m.StarterQuiz),
  },
  {
    path: 'settings',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
  },
  {
    // Not auth-guarded on purpose — a mistyped URL shouldn't force a
    // logged-out visitor through Auth0 login just to see "page not found".
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
