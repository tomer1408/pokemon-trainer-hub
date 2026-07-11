import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { Navbar } from './shared/navbar/navbar';

const NAVBAR_HIDDEN_ON = ['/', '/callback', '/onboarding', '/starter-quiz'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  // Navbar must never flicker: isAuthenticated$ already waits for the SDK's
  // initial isLoading$ check to finish before emitting, and it must stay
  // hidden on Landing/Callback regardless of auth state.
  protected readonly showNavbar = computed(
    () => this.isAuthenticated() && !NAVBAR_HIDDEN_ON.includes(this.currentUrl()),
  );
}
