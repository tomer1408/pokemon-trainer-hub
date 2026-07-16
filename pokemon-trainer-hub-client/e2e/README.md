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
- `e2e/helpers/api-mock.ts` intercepts `localhost:3000/api/*` and maintains
  real, **mutable, in-memory state** (team/favorites/profile/notes/battle
  history) seeded per-test via `mockApi(page, { team, favorites, profile })`.
  Every route handler (profile upsert, team add/remove/swap/reorder,
  favorites, notes, battle history, support, assistant, avatar icons,
  paginated Pokémon search) mirrors the real server's request/response shape
  — including its actual conflict responses (e.g. `409 DUPLICATE` /
  `409 TEAM_FULL` when adding to a full team) — so write flows can be
  asserted end-to-end (submit → real mocked persistence → real re-fetch on
  navigation), not just read against static fixtures.

One thing this surfaced: navigation inside the authenticated spec must use
real in-app links (e.g. `page.getByRole('link', { name: 'My Team' })`), not
`page.goto()` or `page.reload()`, because the Auth0 SDK is configured
memory-only (no `localStorage` cache) in this app — a full page reload
mid-test would drop the mocked session and fall through to an unmocked
silent-auth iframe. Every persistence-proving assertion in these specs
navigates away and back via real clicks instead of reloading.

## Full end-to-end coverage — one spec file per flow

Every remaining page/flow in the app has its own spec file, all built on the
same stateful mock above:

- `explorer-and-team.spec.ts` — Explorer add/favorite/remove, My Team's own
  remove flow, Notes add-and-persist.
- `battle.spec.ts` — a full battle round (pick → confirm → reveal → result)
  and "Battle Again" resetting the round state.
- `battle-history-and-quiz.spec.ts` — a played battle showing up in Battle
  History, result-filter tabs, the match-detail modal; a full Who's That
  Pokémon round including a correct guess and streak advance.
- `starter-quiz.spec.ts` — all 6 quiz questions answered, real recommendation
  scoring, Add to Team from a recommendation card; `starterQuizGuard`'s real
  redirect (`/home` → `/starter-quiz` for an incomplete quiz) and "Skip for
  now" re-enabling `/home`.
- `manage-team.spec.ts` — real native drag-and-drop (`locator.dragTo()`):
  dragging a favorite into an empty slot and Save Changes persisting it,
  drag-to-trash removal + Revert genuinely restoring the pre-visit team
  (even after a confirmed removal), and Leave Without Saving discarding a
  staged drag — proving the page's draft-until-Save architecture actually
  holds.
- `settings-support-profile.spec.ts` — Settings' marketing-email toggle save,
  Support form submission (valid + invalid-email blocked before any API
  call), Profile's edit-team-name save/discard flow.
- `onboarding-and-ai-assistant.spec.ts` — full onboarding form fill (custom
  date-picker, country picker, consent checkbox) through to real profile
  creation and landing on `/starter-quiz`; client-side validation blocking
  incomplete submission; AI Trainer Assistant's Analyze My Team + Refresh
  Analysis and Find by Description, both against the mocked LLM endpoints.

The Starter Quiz's real scoring service (`quiz-recommendation.service.ts`)
silently treats a candidate pool under `MIN_VALID_CANDIDATES` (40) as a
failed load, so the mock catalog carries 47 real Gen-1 Pokémon (not a
minimal handful) to keep that flow genuinely exercised.

### Known flakiness (not a bug in the app or these tests)

`mockAuth0Login`'s code-exchange step is intermittently slow/stuck under
load — confirmed via repeated serial/isolated reruns and a captured
real-app error state ("We couldn't complete sign-in") — independent of
which test is running. On a full concurrent run this currently shows up as
roughly a quarter of specs failing at the shared `login()` helper's
`waitForURL`; running serially or re-running just the affected spec passes
reliably. Treat any failure whose stack trace bottoms out in `login()` (not
in the test's own assertions) as this, not as new logic broken by that
test's specific flow.
