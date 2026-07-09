import { Routes } from '@angular/router';
import { authGuardFn } from '@auth0/auth0-angular';

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
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/onboarding/onboarding').then((m) => m.Onboarding),
  },
  {
    path: 'dashboard',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'explorer',
    canActivate: [authGuardFn],
    loadComponent: () => import('./shared/placeholder/placeholder').then((m) => m.Placeholder),
    data: { title: 'Explorer' },
  },
  {
    path: 'favorites',
    canActivate: [authGuardFn],
    loadComponent: () => import('./shared/placeholder/placeholder').then((m) => m.Placeholder),
    data: { title: 'Favorites' },
  },
  {
    path: 'my-team',
    canActivate: [authGuardFn],
    loadComponent: () => import('./shared/placeholder/placeholder').then((m) => m.Placeholder),
    data: { title: 'My Team' },
  },
  {
    path: 'profile',
    canActivate: [authGuardFn],
    loadComponent: () => import('./shared/placeholder/placeholder').then((m) => m.Placeholder),
    data: { title: 'My Profile' },
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
    loadComponent: () => import('./shared/placeholder/placeholder').then((m) => m.Placeholder),
    data: { title: 'Battle Simulation' },
  },
  {
    path: 'team-card',
    canActivate: [authGuardFn],
    loadComponent: () => import('./shared/placeholder/placeholder').then((m) => m.Placeholder),
    data: { title: 'Team Card' },
  },
  {
    path: '**',
    canActivate: [authGuardFn],
    loadComponent: () => import('./shared/placeholder/placeholder').then((m) => m.Placeholder),
    data: { title: 'Page not found' },
  },
];
