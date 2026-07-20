import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { Navbar } from './shared/navbar/navbar';
import { AssistantChat } from './shared/assistant-chat/assistant-chat';
import { AnalyticsService } from './core/analytics';

const NAVBAR_HIDDEN_ON = ['/', '/callback', '/onboarding', '/starter-quiz'];

// URL first-path-segment -> the exact page name services/analyticsEventService.js's
// APPROVED_PAGE_NAMES expects server-side. Deliberately excludes technical
// stops (callback, onboarding, not-found), /admin/** (its own audience,
// its own audit log — see AdminLayout), and restore-account (reached only
// by a blocked trainer, not a real product page).
const TRACKED_PAGE_NAMES: Record<string, string> = {
  '': 'landing',
  home: 'home',
  explorer: 'explorer',
  'my-team': 'my-team',
  'manage-team': 'manage-team',
  profile: 'profile',
  settings: 'settings',
  support: 'support',
  'ai-assistant': 'ai-assistant',
  battle: 'battle',
  'battle-history': 'battle-history',
  'starter-quiz': 'starter-quiz',
  'whos-that-pokemon': 'whos-that-pokemon',
};

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, AssistantChat],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  protected readonly isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });

  // Path only, no query string — urlAfterRedirects on /callback always
  // carries ?code=...&state=..., which made a straight string match against
  // NAVBAR_HIDDEN_ON silently fail and show the navbar there.
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0].split('#')[0]),
    ),
    { initialValue: this.router.url.split('?')[0].split('#')[0] },
  );

  // Navbar must never flicker: isAuthenticated$ already waits for the SDK's
  // initial isLoading$ check to finish before emitting, and it must stay
  // hidden on Landing/Callback regardless of auth state. Also hidden on
  // every /admin/** route — AdminLayout has its own header (breadcrumb,
  // title, theme switcher) and sidebar; showing the regular app navbar
  // above it stacked two navbars/two theme switchers on the same page,
  // and mixed the Admin Console with the regular Home/Explorer/My Team
  // navigation it's deliberately meant to be separate from.
  protected readonly showNavbar = computed(() => {
    const url = this.currentUrl();
    return this.isAuthenticated() && !NAVBAR_HIDDEN_ON.includes(url) && !url.startsWith('/admin');
  });

  private hasLoggedSessionStart = false;

  constructor() {
    // POST /api/events requires a real Auth0 token (jwtCheck) — an
    // unauthenticated visitor's request would just 401, so both signals
    // below are gated on isAuthenticated() rather than firing blindly.
    effect(() => {
      if (this.isAuthenticated() && !this.hasLoggedSessionStart) {
        this.hasLoggedSessionStart = true;
        this.analytics.logEvent('session_started');
      }
    });

    effect(() => {
      if (!this.isAuthenticated()) return;
      const segment = this.currentUrl().split('/')[1] ?? '';
      const pageName = TRACKED_PAGE_NAMES[segment];
      if (pageName) {
        this.analytics.logEvent('page_viewed', pageName);
      }
    });
  }
}
