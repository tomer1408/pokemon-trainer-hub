import { Routes } from '@angular/router';
import { authGuardFn } from '@auth0/auth0-angular';
import { onboardingGuard } from './shared/onboarding-guard';
import { starterQuizGuard } from './shared/starter-quiz-guard';
import { adminGuard } from './shared/admin-guard';

// Every route below (except '' and 'callback') is wrapped in authGuardFn — the
// SDK's official guard, which redirects unauthenticated visitors straight to
// Auth0 login instead of just hiding UI.
//
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
    path: 'battle-history',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/battle-history/battle-history').then((m) => m.BattleHistory),
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
    path: 'support',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/support/support').then((m) => m.Support),
  },
  {
    path: 'whos-that-pokemon',
    canActivate: [authGuardFn],
    loadComponent: () =>
      import('./pages/whos-that-pokemon/whos-that-pokemon').then((m) => m.WhosThatPokemon),
  },
  {
    // Not auth-guarded on purpose, same reasoning as '**' below: the two
    // health endpoints it calls are already public, and a status page needs
    // to be checkable precisely when something might be broken — including
    // a broken login itself.
    path: 'status',
    loadComponent: () => import('./pages/status/status').then((m) => m.Status),
  },
  {
    // AdminLayout (sidebar+header) is a purely visual shell — it carries NO
    // permission of its own (authGuardFn only), so it never blocks a
    // future limited-scope Admin role. Each child below independently
    // declares and enforces its own permission via adminGuard +
    // data.permission — a real check re-verified server-side by
    // middleware/requirePermission.js on every request, not just a hidden
    // UI link. adminGuard is generic (reads data.permission, not
    // hardcoded), so every child just declares what it needs and reuses
    // the same guard.
    path: 'admin',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/admin/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        canActivate: [adminGuard],
        data: { permission: 'admin:read' },
        loadComponent: () => import('./pages/admin/overview/overview').then((m) => m.AdminOverview),
      },
      {
        path: 'support',
        canActivate: [adminGuard],
        data: { permission: 'support:manage' },
        loadComponent: () => import('./pages/admin/support/support').then((m) => m.AdminSupport),
      },
      {
        path: 'trainers',
        canActivate: [adminGuard],
        data: { permission: 'users:manage' },
        loadComponent: () => import('./pages/admin/trainers/trainers').then((m) => m.AdminTrainers),
      },
      {
        path: 'trainers/:id',
        canActivate: [adminGuard],
        data: { permission: 'users:manage' },
        loadComponent: () =>
          import('./pages/admin/trainer-detail/trainer-detail').then((m) => m.AdminTrainerDetail),
      },
      {
        path: 'system',
        canActivate: [adminGuard],
        data: { permission: 'admin:read' },
        loadComponent: () => import('./pages/admin/system/system').then((m) => m.AdminSystem),
      },
      {
        path: 'analytics',
        canActivate: [adminGuard],
        data: { permission: 'admin:read' },
        loadComponent: () => import('./pages/admin/analytics/analytics').then((m) => m.AdminAnalytics),
      },
      {
        path: 'database',
        canActivate: [adminGuard],
        data: { permission: 'database:read' },
        loadComponent: () => import('./pages/admin/database/database').then((m) => m.AdminDatabase),
      },
    ],
  },
  {
    // authGuardFn ONLY — deliberately not adminGuard, so a non-admin
    // trainer redirected here by adminGuard can never be bounced into
    // another redirect loop.
    path: 'admin/access-denied',
    canActivate: [authGuardFn],
    loadComponent: () =>
      import('./pages/admin/access-denied/access-denied').then((m) => m.AdminAccessDenied),
  },
  {
    // authGuardFn ONLY, same reasoning as admin/access-denied above — a
    // soft-deleted trainer redirected here by callback.ts/onboardingGuard
    // can never be bounced into another redirect loop.
    path: 'restore-account',
    canActivate: [authGuardFn],
    loadComponent: () => import('./pages/restore-account/restore-account').then((m) => m.RestoreAccount),
  },
  {
    // Not auth-guarded on purpose — a mistyped URL shouldn't force a
    // logged-out visitor through Auth0 login just to see "page not found".
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
