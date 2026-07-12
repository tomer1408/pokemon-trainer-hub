# E2E tests

Real Playwright + Chromium against the real running app (`ng serve`) — distinct
from the vitest-based unit tests in `src/app/**/*.spec.ts`, which test isolated
calculation logic, not the rendered UI.

```bash
npm run e2e
```

## What's covered

Everything in `public-routes.spec.ts` runs with **no mocking** — real Angular
routing, the real Auth0 tenant, the real `authGuardFn`:

- Landing page renders its real headline/CTA.
- Clicking "Get Started" genuinely redirects to the real Auth0 tenant.
- Visiting a protected route (e.g. `/home`) while logged out genuinely
  redirects to Auth0 login, proving the route guard actually protects it —
  not just that the guard exists in code.
- An unknown URL shows the real Not Found page **without** being bounced to
  Auth0 login first (the wildcard route is deliberately un-guarded, per
  `app.routes.ts`'s own comment — a mistyped URL shouldn't force login just
  to see "page not found").

## Authenticated flows — `authenticated-flow.spec.ts`

Covers the logged-in path (Home, My Team) using **network-level mocking**
(no real Auth0 tenant changes, no test user, no real database):

- `e2e/helpers/auth-mock.ts` intercepts only the two HTTP calls the SDK
  itself makes — `GET https://<tenant>/authorize` and
  `POST https://<tenant>/oauth/token` — and fulfills them with a
  structurally-valid, claim-correct fake code exchange. This works because
  `@auth0/auth0-spa-js`'s own `jwt.ts` never checks the ID token's
  cryptographic signature client-side, only its claims (`iss`/`aud`/`sub`/
  `nonce`/`exp`) — confirmed by reading the installed SDK source, not
  assumed. The real server's `express-oauth2-jwt-bearer` check is bypassed
  entirely by mocking the backend API below, not defeated.
- `e2e/helpers/api-mock.ts` intercepts `localhost:3000/api/*` and returns
  realistic fixture data shaped like the real `TrainerProfile`,
  `DreamTeamMember[]`, and `TypeChart` responses, so pages render their real
  computed content (Team Power, Battle Readiness, Matchup Analysis) against
  known inputs instead of a live database.

One thing this surfaced: navigation inside the authenticated spec must use
real in-app links (e.g. `page.getByRole('link', { name: 'My Team' })`), not
`page.goto()`, because the Auth0 SDK is configured memory-only (no
`localStorage` cache) in this app — a full page reload mid-test would drop
the mocked session and fall through to an unmocked silent-auth iframe.

Still not covered: flows that *write* through the mocked API (e.g. actually
adding a Pokémon to the team and asserting the POST body) — these fixtures
are read-only. Extending `api-mock.ts` to track POST/DELETE calls in-memory
would be the natural next step if that's wanted.
