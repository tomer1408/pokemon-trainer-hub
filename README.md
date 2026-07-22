# Pokémon Trainer Hub

A web app for registering as a "Pokémon Trainer," exploring Pokémon (via [PokeAPI](https://pokeapi.co/)), and building a personal Dream Team of up to 5 creatures that persists across sessions.

Beyond the core Dream Team, the app includes: an Explorer with search/type filter/sort, a Favorites list, drag-and-drop team management (Manage My Team) with a Head-to-Head comparison modal, a Trainer Profile with a categorized Avatar Icon picker (DB-backed, no live PokeAPI call at picker-open time), a Settings page (theme, colorblind mode, email preferences, privacy/consent record, account), a **real LangChain + Gemini-backed AI Trainer Assistant** (team analysis, "find by description", and a global floating chat widget available on every page), AI-generated Dream Team name suggestions, a Battle Simulation against a randomly-generated opponent (with animated round reveals) plus a persisted Battle History log, a Starter Quiz and a daily "Who's That Pokémon?" quiz, and a Support page with a DB-backed contact form. None of these use mock or hardcoded data — every screen is backed by real PokeAPI data and/or the user's own rows in SQL Server. Where a mockup implied fabricated data (e.g. a numeric Pokémon "level," invented rival trainers), the real version was built on the closest equivalent that actually exists (real Power/type stats, a randomly-generated real opponent) instead.

## Tech Stack

- **Client:** Angular (standalone components, signals)
- **Server:** Node.js + Express
- **Database:** SQL Server (via Docker), accessed through Prisma ORM
- **Auth:** Auth0 (Universal Login) — the client obtains an access token via `@auth0/auth0-angular`, the server validates it via `express-oauth2-jwt-bearer`
- **AI:** LangChain + Google Gemini (`@langchain/google-genai`), server-side only — powers the AI Trainer Assistant, the global chat widget, and AI team-name suggestions. Falls back gracefully (a deterministic generator for team names, a clear error for the rest) if Gemini is unavailable/rate-limited or `GOOGLE_API_KEY` isn't set.
- **External data:** PokeAPI, proxied and cached in-memory by the server (`node-cache`)

## Architecture

```
Angular (localhost:4200)
   │  Authorization: Bearer <token>
   ▼
Express API (localhost:3000)
   │                          │                    │
   ▼                          ▼                    ▼
express-oauth2-jwt-bearer   Prisma              PokeAPI
(validates token            (SQL Server:         (external, read-only,
 against Auth0)              user's own data)     proxied + cached)
```

The client never talks to PokeAPI or the database directly — everything goes through the Express API, which validates the caller's Auth0 token on every request, then either reads/writes the user's own rows via Prisma (identified from the token, never from anything the client sends) or proxies+caches a call to PokeAPI.

## Project Structure

```
pokemon-trainer-hub-client/
  src/app/pages/                 landing, callback, onboarding, home, explorer,
                                  my-team, manage-team, profile, settings, support,
                                  ai-trainer-assistant, battle, battle-history,
                                  starter-quiz, whos-that-pokemon, not-found
  src/app/shared/                navbar, account-menu, assistant-chat (global floating
                                  chat widget), pokemon-detail-modal, pokemon-compare-modal,
                                  team-swap-modal, team-name-generator-modal, policy-modal,
                                  potd-card, loading-screen, colorblind, app-settings, theme,
                                  avatar-categories.ts, team-power.ts / team-matchup.ts
                                  (shared calculations), quiz/, guards, etc.
  src/app/core/                  HTTP services (team, favorites, profile, pokemon,
                                  assistant, notes, quiz, support, avatar-icons,
                                  battle-history)
  e2e/                           Playwright end-to-end tests (see e2e/README.md)

pokemon-trainer-hub-server/
  server.js                     App setup, mounts routers
  routes/                       pokemon.js, team.js, favorites.js, profile.js, notes.js,
                                 assistant.js, support.js, quiz.js, avatarIcons.js,
                                 battleHistory.js
  services/                     prisma.js (DB client), pokeapi.js (fetch + cache),
                                 teamService.js, favoritesService.js, assistantService.js
                                 (LangChain/Gemini), rateLimiter.js, teamNameFallback.js,
                                 ageRange.js, serviceError.js
  scripts/                      seed-avatar-icons.js (one-time import of the curated,
                                 categorized avatar icon set into the AvatarIcon table)
  middleware/                   auth.js (jwtCheck)
  prisma/                       schema.prisma (DreamTeamMember, Favorite, TrainerNote,
                                 SupportRequest, BattleMatch, AvatarIcon, TrainerProfile),
                                 migrations/
```

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
- Docker (for the SQL Server container)
- An Auth0 tenant (free tier is enough)

## Setup

### 1. Database (SQL Server via Docker)

```bash
docker run -d --name pokemon-sql -p 1433:1433 \
  -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=<your-password>" -e "MSSQL_PID=developer" \
  mcr.microsoft.com/mssql/server
```

`-p 1433:1433` is required — without it the container's port isn't actually reachable from the host.

### 2. Auth0 configuration

1. **Create an API**: Applications → APIs → Create API. Note its **Identifier** (this is the `audience`) and use signing algorithm **RS256**.
2. **Create a Single Page Application**: Applications → Applications → Create Application → Single Page Web Applications. Set **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins** to `http://localhost:4200`.
3. **Authorize the SPA for the API** — Applications → APIs → *your API* → the applications-authorization tab (labeled "Machine to Machine Applications" in some tenants, but it also lists SPA/Regular Web apps) → toggle your SPA to **Authorized**.
   > Skipping this step is a common gotcha: login will succeed, but the very first token request will fail with `invalid_request: Client "..." is not authorized to access resource server "..."`. If that happens, this is the fix.
4. Note down: the tenant **Domain**, the API **Identifier** (audience), and the SPA **Client ID**.

### 3. Server

```bash
cd pokemon-trainer-hub-server
npm install
```

Create a `.env` file:

```env
DATABASE_URL="sqlserver://localhost:1433;database=PokemonTrainerHub;user=SA;password=<your-password>;trustServerCertificate=true"
AUTH0_AUDIENCE="<API Identifier from step 2.1>"
AUTH0_ISSUER_BASE_URL="https://<your-tenant-domain>/"
# Optional — see "Delete My Account" below. Without these, account deletion
# still removes all of a trainer's DB data; only the Auth0 identity survives.
AUTH0_M2M_CLIENT_ID=
AUTH0_M2M_CLIENT_SECRET=
# Optional — see "Error tracking (Sentry)" below.
SENTRY_DSN=
```

Then run all migrations and start the server:

```bash
npx prisma migrate dev
node server.js
```

This applies every migration in `prisma/migrations/` in order against a fresh database — verified to produce the exact schema `schema.prisma` expects (tested end to end against a clean database, not just the existing dev one).

Server listens on `http://localhost:3000`.

### 4. Client

```bash
cd pokemon-trainer-hub-client
npm install
```

In `src/app/app.config.ts`, fill in the `provideAuth0()` config with the **Domain**, **Client ID**, and **audience** (same audience as the server's `AUTH0_AUDIENCE`) from step 2.4.

```bash
npx ng serve
```

Client runs on `http://localhost:4200`.

### 5. Delete My Account & Auth0 profile lookups — Auth0 Management API (optional)

Settings has a real "Delete My Account" action: it deletes every DB row a trainer owns in one transaction, then deletes their actual Auth0 identity via the Auth0 Management API. The Admin Trainer Detail page's "Refresh Auth0 info" action and the soft-delete feature's `POST /api/profile/restoration-request` (which looks up the caller's real email to attach to the support request) also go through this same API, as a real read rather than a delete. All three need their own Machine-to-Machine Application (separate from the SPA):

1. Applications → Applications → Create Application → name it (e.g. "Pokemon Trainer Hub M2M") → type **Machine to Machine Applications**.
2. When asked which API to authorize, select **Auth0 Management API**.
3. Under scopes, check **both `delete:users` and `read:users`** (least privilege beyond that — this app never needs to write/create users or touch anything else via this API). Missing `read:users` doesn't break account deletion, but does break both of the read-only features above with a 502.
4. Settings tab of the new application → copy **Client ID** and **Client Secret** into the server's `.env` as `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`.

Without `delete:users`, Delete My Account still deletes all of a trainer's DB data (the part that matters most) — the Auth0 side of the deletion just fails gracefully and the response includes a `warning` field instead of crashing. **If you add a scope to an already-configured M2M application later** (e.g. adding `read:users` to an app that only had `delete:users`), the running server process must be restarted before it takes effect — `services/auth0Management.js` caches the Management API token in memory for its full lifetime (up to 24h), and a token issued before the scope change keeps working with the old, narrower scope until a fresh one is requested.

### 6. Error tracking (Sentry, optional)

Both apps report real runtime errors to [Sentry](https://sentry.io) if configured — with no DSN set, both SDKs no-op safely (no code changes needed to disable it).

1. Free sign-up at sentry.io.
2. Create two projects: one **Node.js/Express** platform, one **Angular** platform.
3. Each project → Settings → Client Keys (DSN) → copy it.
4. Server DSN → `SENTRY_DSN` in the server's `.env`. Client DSN → `sentryDsn` in `pokemon-trainer-hub-client/src/environments/environment.ts` (local) and `environment.production.ts` (deployed) — a client-side DSN is meant to be public, same trust level as the Auth0 domain/clientId already hardcoded in `app.config.ts`.

## Testing

Both sides have unit tests; neither needs a real database, Auth0 tenant, or Gemini key to run.

```bash
# Server — native Node test runner (services + route-level tests)
cd pokemon-trainer-hub-server
npm test
```

Server tests fall into two kinds:
- **Service/utility tests** (`services/*.test.js`) — pure logic: age-range bucketing, the team-name fallback generator, the rate limiter, the Gemini-backed assistant service's fallback behavior (mocking the model call, never a real Gemini request), the strongest-by-type ranking cache (tie-breaking, limit clamping, cache reuse, in-flight de-duplication, and retry-after-failure — stubbing `global.fetch` directly rather than a real PokeAPI call), and `teamService.js` (duplicate detection, the 5-member cap, gap-safe slot position management, and the swap/reorder/save transactions — each with Prisma and PokeAPI swapped for test doubles via `mock.module`).
- **Route-level tests** (`routes/*.test.js`) — exercise the real Express router and its error-code mapping through `supertest`, with `middleware/auth.js` and the relevant service module swapped for test doubles via Node's built-in module mocking (`node:test`'s `mock.module`, hence the `--experimental-test-module-mocks` flag baked into the `test` script) — so these never touch a real Auth0 tenant or a real database.

```bash
# Client — Angular's vitest-based unit-test builder
cd pokemon-trainer-hub-client
npm test
```

Client tests cover shared, framework-independent calculation logic (`shared/*.spec.ts`): Team Power/Tier/Type-Coverage math, the real-type-chart-driven Battle Readiness/Matchup Analysis formulas, and the Starter Quiz's rule-based recommendation engine (`shared/quiz/*.spec.ts`) — preference-weight normalization, type/stat/balance scoring, the honest 0-100 Match Score, dual-type contribution capping, current-team exclusion, and the shared dataset cache's retry/dedup behavior.

```bash
# Client — Playwright, a real Chromium against the real running app
cd pokemon-trainer-hub-client
npm run e2e
```

E2E tests drive a real browser against `ng serve`. `public-routes.spec.ts` covers what's reachable **without** being logged in with zero mocking — real routing, the real Auth0 tenant redirect firing, a protected route genuinely bouncing an unauthenticated visitor to login, the un-guarded 404 page. `authenticated-flow.spec.ts` covers the logged-in path (Home, My Team) via network-level mocking of both Auth0's token exchange and the backend API (no real Auth0 tenant changes, no test user, no real database) — see `e2e/README.md` for how the mocking works and what it deliberately doesn't cover yet (write flows through the mocked API).

**Known gap:** no Angular component tests exist yet (`ng test` only covers framework-independent calculation logic) — component-level UI behavior is verified by manually exercising the running app, not by an automated test.

## Deployment

**Live**: Frontend — `https://pokemon-trainer-hub-three.vercel.app` · Backend — `https://pokemon-trainer-hub-server.onrender.com`

| | Local dev | Production |
|---|---|---|
| Database | SQL Server via Docker | **Azure SQL Database** — same Prisma schema, same `sqlserver` provider, no code differences |
| Backend | `node server.js` on `localhost:3000` | Render (free web service) |
| Frontend | `ng serve` on `localhost:4200` | Vercel |
| API base URL | `environment.ts` | `environment.production.ts`, swapped in automatically by `ng build`'s `fileReplacements` |

### Database networking — an honest note

Azure SQL's firewall is IP-allowlist based, and Render's free tier doesn't provide a dedicated/static outbound IP (that's a paid add-on, ~$100/month at time of writing — not justified for a student project). Instead, this deployment allowlists **Render's published outbound CIDR ranges for its region** (Render Dashboard → service → Connect → Outbound tab), which are shared across *all* Render customers in that region, not exclusive to this app.

This means the network-level allowlist is broader than a dedicated IP would be — acceptable for a demo/take-home project, where the real access boundary is still the database password (never committed, stored only in Render's environment variables) plus Auth0 authentication and JWT validation on every backend route. **This is not the setup you'd want for a real production system** — for that, use Render's paid dedicated outbound IP feature (or host the backend on Azure itself, e.g. App Service, so Azure SQL's "allow Azure services" applies directly) and allowlist only that.

### Environment variables (Render)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Azure SQL connection string — `sqlserver://<server>.database.windows.net:1433;database=PokemonTrainerHub;user=<login>;password={...};encrypt=true;trustServerCertificate=false` (note: no `tcp:` prefix — that's an ADO.NET-format leftover that breaks `@prisma/adapter-mssql`'s simpler `host:port` parser) |
| `AUTH0_AUDIENCE` | Same as local `.env` |
| `AUTH0_ISSUER_BASE_URL` | Same as local `.env` |
| `CORS_ORIGIN` | The deployed Vercel URL, so the API only accepts cross-origin requests from the real frontend |
| `GOOGLE_API_KEY` | Same as local `.env` — without it, the AI Trainer Assistant/chat widget/AI team names degrade as described in the Tech Stack section above |
| `GOOGLE_GEMINI_MODEL` | Optional, same as local `.env` |
| `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET` | Optional — same as local `.env`. Powers real Auth0-identity deletion in Delete My Account; see step 5 above |
| `SENTRY_DSN` | Optional — same as local `.env`. Server-side error tracking; see step 6 above |
| `PURGE_SWEEP_SECRET` | Required for the account-deletion purge job to run in production — a real random value (e.g. `openssl rand -hex 32`), shared with the UptimeRobot monitor configured below. Without it, `POST /api/internal/purge-sweep` always 401s and soft-deleted accounts past their 30-day window are never automatically purged |

Auth0's **Allowed Callback URLs**, **Logout URLs**, and **Web Origins** must include the Vercel URL alongside `localhost:4200` (not replacing it, so local dev keeps working).

**Build Command (Render)**: `npm install && npx prisma generate && npx prisma migrate deploy` — `migrate deploy` (not `migrate dev`) only applies migrations that already exist as files in `prisma/migrations/` (created earlier via `migrate dev` against local Docker and committed to git); it never generates or guesses new ones, which is what makes it safe to run automatically against a real production database on every deploy. This means a schema change only needs `migrate dev` run once locally — Render then applies it in production the next time `main` is deployed, with no manual step.

### Keeping the free-tier backend warm

Render's free tier spins the server down after ~15 minutes of no traffic; the next request then pays a one-time cold start (measured directly: ~31.5s cold vs ~0.25s once warm). The first mitigation attempt was a GitHub Actions workflow (`.github/workflows/render-keep-alive.yml`) pinging every 10 minutes — but comparing its actual run timestamps via the GitHub API showed real gaps of 1–3 hours, not 10 minutes. GitHub does not guarantee frequent `schedule` triggers fire on time, especially on low-activity repos, so the server kept going cold anyway.

The real fix: **[UptimeRobot](https://uptimerobot.com)**, a purpose-built uptime monitor, pinging two endpoints every 5 minutes (comfortably inside Render's 15-minute window):
- `GET /api/health` — keeps the Node process itself alive.
- `GET /api/health/db` — separately exercises the real Prisma → Azure SQL connection, since that pays its own first-connection cost (measured ~4s) independently of the Node process being warm.

The old GitHub Actions workflow is kept in the repo as a harmless secondary backup (unreliable timing, but free and non-conflicting) — UptimeRobot is the mechanism actually relied on.

### Account-deletion purge (manual invocation, by decision — no scheduler yet)

Deleting a trainer account (self-service via Settings, or admin-initiated via the Admin Dashboard) is a **soft delete** with a 30-day recovery window, not immediate — see `services/accountService.js`'s `softDeleteAccount()`/`restoreAccount()`. Permanently removing an account once that window elapses needs something to actually call `POST /api/internal/purge-sweep` — and this app has **no in-process scheduler** (no `node-cron`, no `setInterval`-based poller), for the same reason an in-process keep-warm timer wouldn't work either (see above): Render's free tier spins the process down when idle, so a timer inside it simply doesn't fire while asleep.

**Current decision: no automatic scheduler at all — not UptimeRobot, not cron-job.org, not a GitHub Actions `schedule` workflow.** Reaching `purgeAt` does **not** by itself trigger deletion. An eligible account simply stays soft-deleted (fully blocked from logging in, fully recoverable by an admin) until an authorized operator manually runs:

```bash
curl -X POST https://<your-render-url>/api/internal/purge-sweep \
  -H "X-Purge-Secret: <the real value of your PURGE_SWEEP_SECRET env var>"
```

(HTTP header names are case-insensitive — the server reads it via `req.get('x-purge-secret')` — so `X-Purge-Secret` and `x-purge-secret` are the same header; the real secret **value** is the only part that must match exactly.) The secret lives only in Render's environment variables — never in this repo, the Angular client, logs, or any API response — and there is deliberately no GET variant and no way to pass it via URL/query string, so it can never end up in server access logs or browser history.

Should an automatic scheduler be added later, everything below (auth, rate limiting, eligibility, idempotency) already works unchanged — the only remaining step would be pointing a real scheduler (UptimeRobot's third monitor, alongside the two keep-warm ones, was the original plan) at this same endpoint with this same header. Nothing about the endpoint itself needs to change to support that later.

The endpoint finds every `TrainerProfile` whose `purgeAt` has passed and permanently deletes it via the same, unmodified `accountService.deleteAccount()` used everywhere else — never a second deletion code path. Full security/eligibility design:

- **Auth**: not behind Auth0 (`jwtCheck`) — UptimeRobot has no access token — instead gated by `middleware/requirePurgeSecret.js`, a dedicated secret (`PURGE_SWEEP_SECRET`, never reused from Auth0/`DATABASE_URL`/`SENTRY_DSN`) that lives only in the server's env vars and the UptimeRobot monitor's header config — never in this repo, the Angular client, logs, or any API response. The check fails closed (401, identical response body either way) on a missing/malformed/wrong header *or* an unconfigured secret, and compares using `crypto.timingSafeEqual` (constant-time) rather than `===`, so a wrong guess can't be narrowed down via response-time differences.
- **Rate limiting**: `routes/internal.js` wraps the route in the same `services/rateLimiter.js` used elsewhere in this app (e.g. the AI team-name generator) — 5 requests/minute against a single fixed key, applied *before* the secret check, so it also caps brute-force guessing attempts, not just legitimate traffic. A real 5-minute-interval monitor never gets close to this limit.
- **Eligibility (server-computed only, never trusts the caller)**: a candidate must have `deletedAt` set **and** `purgeAt` set **and** `purgeAt <= ` the server's own current time — computed directly from the `WHERE` clause on every run, not from any request body/header (the caller sends nothing but the secret — there is no way to name a user, a date, or an eligibility flag in this request at all).
- **Idempotency**: `accountService.deleteAccount()` now reports how many `TrainerProfile` rows it actually deleted (0 or 1). A candidate already removed by a concurrent process (an admin's "Delete Forever", or an overlapping sweep run) is counted as **skipped**, not purged again — running the sweep repeatedly, or concurrently, cannot corrupt or double-process anything. One candidate throwing (e.g. a transient DB error) is caught per-candidate and reported as **failed** without aborting the rest of the batch.
- **Response**: aggregate counts only — `{ eligible, purged, skipped, failed }` — never a list of ids, emails, or names, since anything holding the shared secret can read this response, not just an authenticated admin.
- **Failure logging**: a per-candidate failure is logged via `console.error` (no secret, no email/name — only the internal `auth0UserId`, consistent with how `AdminAuditLog.targetId` already stores it elsewhere in this app) and reported to Sentry via `Sentry.captureException`, which silently no-ops if `SENTRY_DSN` isn't configured.

Automated coverage: `middleware/requirePurgeSecret.test.js` (missing/wrong/correct secret, the timing-safe-compare path, identical 401 shape regardless of failure reason), `services/purgeSweepService.test.js` (eligibility query shape, active/not-yet-eligible accounts excluded, skip-on-already-gone, one failure doesn't block the batch, repeated runs stay safe, response never carries PII), `routes/internal.test.js` (rate limiting, and that neither the configured secret nor a caller's guess is ever echoed back).

This was verified end to end against production with a real, disposable trainer account before this decision was made: soft-deleted it, confirmed an unauthorized purge request was rejected, confirmed it was *not* purged before its `purgeAt`, forced `purgeAt` into the past under controlled, explicitly-approved conditions and confirmed an authorized request purged only that account (other real accounts unaffected, verified via a read-only Recently Deleted check beforehand), confirmed the sweep and its audit-log entry showed up correctly, and confirmed re-running the sweep afterward was a safe no-op.

### Deployment health check

**`GET /api/health/db`** confirms the deployed backend can actually reach the database (not just that the Node process is up) — see the Health section below.

### Monitoring

Three complementary layers, each doing a different job:
- **UptimeRobot** (external, always-on) — pings `/api/health` and `/api/health/db` every 5 minutes, mainly to keep Render's free tier warm (see above).
- **`/status`** (in-app, on-demand, public — no login required) — a real-time page showing both endpoints' live up/down state and actual client-measured latency, auto-refreshing every 30s. For a human to check right now, including exactly when something might be broken (deliberately not login-gated, since forcing a login first would be self-defeating if login itself is what's down).
- **Sentry** (error tracking, both apps) — captures real unhandled exceptions client- and server-side; see "Error tracking (Sentry)" in Setup above for enabling it.

## API Reference

All endpoints except `/api/health` require a valid Auth0 access token: `Authorization: Bearer <token>`. The user is always identified server-side from the token's subject claim — no endpoint accepts or trusts a user id sent by the client. Missing/invalid tokens get a `401`. Unexpected server errors return a `500` with a generic message (details are logged server-side, never sent to the client).

### Health

**`GET /api/health`** — no auth required. Confirms the server process is up — does not touch the database.
Response: `{ "status": "ok", "message": "..." }`

**`GET /api/health/db`** — no auth required. Confirms the server can actually reach the database (used to verify the Render → Azure SQL connection after deploying). Deliberately returns nothing beyond ok/error — no row data, counts, or connection details, even on failure.
Response: `{ "status": "ok", "db": "ok" }`, or `503 { "status": "error", "db": "error" }` on failure.

### Pokémon

**`GET /api/pokemon`** — search/browse, proxied from PokeAPI with in-memory caching.

Query params (all optional, except `type` for `sort=strongest` — see below):
| Param | Values | Default |
|---|---|---|
| `search` | substring match on name | — |
| `type` | e.g. `fire`, `water` | — |
| `sort` | `id` \| `name` \| `strongest` | `id` |
| `page` | page number | `1` (20 results/page) |

`sort=strongest` **requires** `type` — ranking needs a real detail fetch per candidate, and an unfiltered sort would mean ranking PokeAPI's entire dataset (1,300+ Pokémon) on every cold-cache request. The actual ranking is computed once per type and cached for 24h (`services/pokeapi.js`'s `getStrongestRankedList`/`getStrongestOfType`), with in-flight de-duplication (concurrent requests for the same uncached type share one computation) and a bounded concurrency limit (8 detail fetches in flight at a time, never one unbounded burst) — the same ranked-by-type data also backs the AI Trainer Assistant's "strongest of type" pick (see below).

Response: `{ results: Pokemon[], page, pageSize, total }`
Errors: `400` for an unknown `type`, or for `sort=strongest` without a `type`; `502` if PokeAPI is unreachable.

**`GET /api/pokemon/:id`** — single Pokémon, by numeric id or name. Fuller shape than the list endpoint (adds flavor text, type weaknesses/resistances, ability descriptions, top moves) — this is what backs the Pokémon Detail Modal.

Response shape (`Pokemon`):
```json
{
  "id": 25, "name": "pikachu", "baseExperience": 112,
  "stats": [{ "name": "hp", "value": 35 }, "..."],
  "types": ["electric"], "abilities": ["static", "lightning-rod"],
  "spriteUrl": "...", "cry": "...", "height": 0.4, "weight": 6.0,
  "flavorText": "...",
  "weaknesses": ["ground"], "resistances": ["flying", "steel"],
  "abilities": [{ "name": "static", "description": "..." }],
  "topMoves": [{ "name": "thunderbolt", "type": "electric", "power": 90 }]
}
```
Errors: `404` if the Pokémon doesn't exist, `502` if PokeAPI is unreachable.

**`GET /api/pokemon/type-chart`** — real weak/resist/strong lists for all 18 Pokémon types at once (PokeAPI's actual damage relations, cached). Powers My Team's Battle Readiness and Matchup Analysis cards, which need team-wide type effectiveness rather than one Pokémon's.

Response: `{ [typeName]: { weak: string[], resist: string[], strong: string[] } }` for each of the 18 types.

### Dream Team

Team is capped at **5** members. Each member also has a `position` (0-based slot order, used by drag-and-drop reordering).

**`GET /api/team`** — the current user's team, ordered by `position`, each member enriched with `stats`/`types`/`baseExperience`.

**`POST /api/team/:id`** — add a Pokémon (`:id` = pokemonId).
- `409 { reason: "DUPLICATE" }` if already in the team.
- `409 { reason: "TEAM_FULL" }` if the team already has 5 members.
- `404` if the Pokémon doesn't exist. `201` with `{ message, member }` on success.

**`DELETE /api/team/:id`** — removes the member. `204` on success (idempotent — no error if it wasn't there).

**`PATCH /api/team/reorder`** — body `{ pokemonIds: number[] }`. Persists a pure drag-and-drop reorder. `pokemonIds` must be exactly the current team's members, just resequenced — anything else (an add, a remove, an unknown id) is rejected with `400`.

**`POST /api/team/swap`** — body `{ removePokemonId, addPokemonId }`. Atomically removes one member and adds another in a single transaction, keeping the same slot position. Backs the Team Swap / Head-to-Head modal. `404` if `removePokemonId` isn't on the team or `addPokemonId` doesn't exist; `409 { reason: "DUPLICATE" }` if `addPokemonId` is already on the team.

**`PUT /api/team`** — body `{ pokemonIds: number[] }`, the *full* target team in its final order (unlike `/reorder`, this one **can** add/remove members). Backs Manage My Team's Save Changes: diffs the submitted list against the current team and applies every add/remove/position-change as one atomic transaction, then returns the saved team as re-read from the database. `400` if the list has more than 5 entries or a duplicate id; `404` if a newly-added id doesn't exist.

### Favorites

Same shape as Team, but **no size limit**.

**`GET /api/favorites`**, **`POST /api/favorites/:id`**, **`DELETE /api/favorites/:id`** — identical semantics to the Team endpoints above, minus the `TEAM_FULL` case.

### Trainer Profile

**`GET /api/profile`** — the current user's profile. `404` if not created yet. Only safe, user-facing fields are ever returned — never the internal row id or the Auth0 subject/user id. The response also includes a server-derived `ageRange` (e.g. `"18-24"`), computed fresh from `dateOfBirth` on every request — never stored, never sent by the client.

**`POST /api/profile`** — creates or updates (upsert) the profile.
Body (all required unless noted): `trainerName, favoriteType, firstName, lastName, dateOfBirth, country`, plus optional `avatarPokemonId` (a real Pokédex id used as a profile icon) and `teamName` (custom Dream Team name).
`400` if any required field is missing, if `dateOfBirth` doesn't parse, is in the future, or is under the minimum age (13).

`experienceLevel` is **not** a client-editable field, even though it's accepted/echoed in the shared `TrainerProfile` shape — every new profile is created at `'Beginner'` server-side and every update just carries forward whatever's already on file, regardless of what's sent. A future levels-up feature should change it via its own dedicated endpoint (like `/whos-that-streak` below), not by trusting a client-sent value on this general save.

Consent fields: `acceptedPolicy` (boolean) is **required to be `true`** the first time a profile is created (`400` otherwise) — on every later update it's ignored from the request body and just carries forward whatever was already on file; a profile can never re-demand or overwrite its original acceptance. `acceptedPolicyAt`/`policyVersion` are set server-side only on first creation, never trusted from the client. `marketingEmailsOptIn` (boolean) is the one consent-related field that stays freely editable after creation — sending it updates the stored value; omitting it on an update leaves the existing value untouched (never silently reset to `false`).

**`PATCH /api/profile/starter-quiz`** — marks the current user's Starter Quiz as completed (`hasCompletedStarterQuiz: true`). Real, server-side, tied to the JWT-identified user — not client-side storage, so it survives across devices/browsers. `404` if the trainer has no profile row yet.

**`PATCH /api/profile/team-name`** — body `{ name }`. Updates only the Dream Team's custom name, validated the same way regardless of source — used by the AI Team Name Generator (My Team page) so picking an AI suggestion doesn't require resending the whole profile. `400` if `name` fails validation (length/content), `404` if the trainer has no profile row yet.

**`PATCH /api/profile/whos-that-streak`** — body `{ streak }` (non-negative integer). Records a new "Who's That Pokémon?" best streak, real and server-side (not browser storage). Only ever moves the stored best **up** — the server keeps `max(existing, submitted)`, so a stale/out-of-order request can never regress a trainer's real best. `400` if `streak` isn't a non-negative integer, `404` if the trainer has no profile row yet.

**`DELETE /api/profile`** — deletes every DB row the trainer owns (Dream Team, favorites, notes, support requests, battle history, and the profile itself) in one transaction, then deletes their real Auth0 identity via the Management API (see "Delete My Account" in Setup above). Always `200` once the DB transaction commits; the response includes a `warning` field only if the Auth0 identity deletion failed afterward — the DB half is what's guaranteed, by design (see `services/accountService.js` for the ordering rationale).

### Trainer Notes

Free-text notes a trainer can attach to any Pokémon (not just team/favorited ones) — a running log, not a single editable note per Pokémon.

**`GET /api/notes/:pokemonId`** — the current user's notes for that Pokémon, most recent first.

**`POST /api/notes/:pokemonId`** — body `{ text }`. Always creates a new note. `400` if `text` is empty.

**`DELETE /api/notes/:noteId`** — deletes one note by its own id, scoped to the current user (can't delete another trainer's note by guessing an id). `204` on success.

### AI Trainer Assistant

Real LangChain + Google Gemini calls, server-side only (the client never talks to Gemini directly, never sends a Gemini key). The model only ever picks a Pokémon **type** and writes reasoning text — the actual Pokémon returned is always looked up afterward from real PokeAPI data via the existing `strongest-of-type` logic, never something the model invented. `/analyze`, `/query`, and `/chat` all degrade the same way on a Gemini failure: a quota/rate-limit issue returns `503` with a "come back later" message, anything else `502`. `/team-name` is the exception — see below.

**`POST /api/assistant/analyze`** — analyzes the current user's real Dream Team (fetched server-side from the JWT, never from the request body) and recommends a type to fill a gap.
Response: `{ type, reasoning, pokemon }` — `pokemon` is a real `Pokemon` summary of the strongest real Pokémon of that type, or `null` if none could be resolved.

**`POST /api/assistant/query`** — body `{ text }`, a free-text description (e.g. "something fast and electric"). Same response shape as `/analyze`. `400` if `text` is empty.

**`POST /api/assistant/chat`** — body `{ messages: [{ role: "user" | "assistant", text }, ...] }`. Backs the global floating chat widget (open-ended, multi-turn Q&A about the app) — distinct from the structured type-recommendation routes above.
Response: `{ text, pokemon }` — `pokemon` is a real `Pokemon` summary when the reply centers on one specific Pokémon, otherwise `null`. `400` if `messages` isn't a non-empty array of that shape.

**`POST /api/assistant/team-name`** — body `{ style }` (one of `Epic`, `Competitive`, `Mysterious`, `Cute`, `Funny`). Generates 3 Dream Team name suggestions for the current user's real team (fetched server-side, never trusted from the client). Rate-limited to 5 generations/trainer/hour (`429` past that) since — unlike the routes above — there's no natural per-request cost signal to the user. Unlike `/analyze`/`/query`/`/chat`, this route **always** resolves with usable names: `assistantService.generateTeamNames()` itself falls back to a deterministic, non-AI generator (real team type/composition based, not random) on any Gemini failure (error, timeout, quota) — so a `502`/`503` here means something unrelated to Gemini broke. `400` if `style` is invalid or the team is empty.
Response: `{ names: string[], source: "ai" | "fallback" }`.

### Support

**`POST /api/support`** — body `{ name, email, topic, message }`. Real, server-side persisted contact request tied to the JWT-identified user — no email is actually sent, but nothing is faked either: the row is genuinely saved and reviewable in the database. `400` if `email` isn't a valid-looking address or `topic`/`message` is empty.
Response: `201 { id, createdAt }`.

### Quiz ("Who's That Pokémon?")

**`GET /api/quiz/round`** — a fresh round: 1 real target Pokémon (the client silhouettes its real sprite) plus 3 real distractor options, shuffled together, all sourced from the same PokeAPI-backed master list every other screen uses. Nothing here is invented — every option resolves to an actual Pokémon.
Response: `{ target: { id, name, types, spriteUrl, baseExperience }, options: [{ id, name, types }, ...] }` (4 options, target's id included among them).
Errors: `502` if fewer than 4 valid Pokémon could be loaded from PokeAPI.

### Avatar Icons

**`GET /api/avatar-icons`** — the full curated, categorized set of profile-icon options, read straight from our own `AvatarIcon` table (seeded once via `scripts/seed-avatar-icons.js`) — no PokeAPI call at request time, unlike the picker's original per-page-load approach. 35 icons across 7 categories (Popular, Fire, Water, Electric, Grass, Normal, and a General category of real PokeAPI **item** sprites like Poké Ball variants, not creatures — those get negative sentinel ids so `TrainerProfile.avatarPokemonId` stays a plain Int with no schema change).
Response: `{ pokemonId, name, category, spriteUrl, sortOrder }[]`, ordered by category then `sortOrder`.

### Battle History

Every completed Battle Simulation match, persisted so a trainer's win/loss record survives across sessions and devices (not just kept in the browser for the current match).

**`GET /api/battle-history`** — the current user's matches, most recent first.
Response: `{ id, opponentName, difficulty, rounds, roundsPlayed, opponentType, luckFactor, result, yourWins, oppWins, roundDetails, teamSnapshot, createdAt }[]` — `roundDetails`/`teamSnapshot` are stored server-side as serialized JSON (one flat table, no normalized round table — this app's scale doesn't need relational round queries) and parsed back into arrays here, so the client never has to know they're stored serialized.

**`POST /api/battle-history`** — records one completed match, called once by the client when a Battle match is decided; never blocks the match-over screen if it fails.
Body: `{ opponentName, difficulty, opponentType, luckFactor, rounds, roundsPlayed, yourWins, oppWins, result: "win" | "loss", roundDetails: object[], teamSnapshot: object[] }` — all required. `400` if any field is missing/malformed. `201 { id, createdAt }` on success.

## Admin Dashboard

A separate, real-permission-gated area at `/admin` (client) and `/api/admin/*` (server) for the app's own operators — Support Request management, Trainer management, an Overview of real KPIs, System Health, Analytics, and a read-only Database Explorer. Not a trainer-facing feature; nothing here is reachable without a real Auth0 role.

### Auth0 setup (one-time)

1. APIs → your API → Settings → enable **RBAC** and **Add Permissions in the Access Token**.
2. APIs → your API → Permissions → add exactly: `admin:read`, `support:manage`, `users:manage`, `database:read`.
3. User Management → Roles → create an **Admin** role → assign all 4 permissions to it.
4. User Management → Users → your user → Roles → assign the Admin role.
5. **Log out and back in** after any role/permission change — a cached access token keeps holding the old claim otherwise.
6. Verify by decoding the real access token **locally** (browser DevTools) and confirming the `permissions` array is present — never paste a real token into a third-party site.

No new environment variables — the Admin Dashboard reuses the same `AUTH0_M2M_CLIENT_ID`/`AUTH0_M2M_CLIENT_SECRET` (Trainers' "Refresh Auth0 Info") and `SENTRY_DSN`/`GOOGLE_API_KEY` (System Health's configured-check) the rest of the app already has configured.

### Permission mapping

| Permission | Grants |
|---|---|
| `admin:read` | Overview, System Health, Analytics |
| `support:manage` | Support Requests |
| `users:manage` | Trainers (list, detail, Auth0 info, account deletion) |
| `database:read` | Database Explorer |

Every permission is re-checked **server-side** on every request (`middleware/requirePermission.js`) — the client-side guard (`adminGuard`/`AdminService`) is a UX convenience only, and fails closed (zero permissions) on every error mode. No admin page ever renders a full raw Auth0 user id.

### Endpoints

All routes below require a valid Auth0 access token **and** the specific permission listed — a token missing the permission gets `403`; no token gets `401`.

| Route | Permission | Notes |
|---|---|---|
| `GET /api/admin/ping` | `admin:read` | Smoke-test route, proves the auth chain end to end. |
| `GET/PATCH /api/admin/support`, `/api/admin/support/:id` | `support:manage` | Status/priority validated allowlists; original message/name/email immutable. |
| `GET /api/admin/trainers`, `/:id`, `/:id/auth0`, `DELETE /:id` | `users:manage` | Deletion reuses the same `accountService.deleteAccount` self-service uses. |
| `GET /api/admin/overview` | `admin:read` | Real KPIs, recent support requests, recent cross-model activity — one response. |
| `GET /api/admin/system` | `admin:read` | Real DB/PokeAPI checks; Gemini/Sentry reported as configured/not-configured only, never a fabricated "Operational". |
| `GET /api/admin/analytics` | `admin:read` | Real over-time series, funnel, popularity/battle/support distributions, plus real DAU/MAU/retention/page-views/sessions/feature-adoption/AI-success-rate from the `AppEvent` table (see "Product analytics tracking" below). |
| `GET /api/admin/database/tables`, `/:table`, `/:table/:id` | `database:read` | Read-only browser over 9 whitelisted models (including `AppEvent`); every response is masked server-side (`services/adminDatabaseRegistry.js`) before it ever leaves the API. |

### Product analytics tracking

Real event-collection infrastructure (previously a deferred, not-yet-approved phase in `ADMIN_DASHBOARD_PLAN.md` — now built). A new `AppEvent` table plus `TrainerProfile.lastActiveAt` back every DAU/MAU/retention/page-view/session/feature-adoption/AI-success-rate number the Analytics page shows — nothing here is estimated or backfilled, so these numbers are honestly small/zero for any activity from before this shipped.

- **Approved event registry** (`services/analyticsEventService.js`), 11 events total, each either **server-owned** (logged by trusted server code immediately after the real action it describes already succeeded — `battle_completed`, `support_request_created`, `pokemon_added_to_team`, `dream_team_completed`, `onboarding_completed`, `starter_quiz_completed`, `ai_request_completed`/`ai_request_failed`) or **client-owned** (`session_started`, `page_viewed`, `whos_that_round_completed` — the only three a client request can ever name, via a much smaller `CLIENT_ALLOWED_EVENT_TYPES` allowlist; every server-owned type is rejected outright even if a client explicitly names it).
- **`POST /api/events`** — the one client-facing route, `jwtCheck`-gated, rate-limited (30/min per trainer), validates event type + page name + a strict per-event metadata shape (extra keys/wrong types rejected, not coerced) before anything is written. The acting trainer always comes from the verified JWT, never the request body.
- **Client instrumentation** (`core/analytics.ts`, fire-and-forget — a logging failure never surfaces to the trainer or blocks whatever real action triggered it): `session_started` once per authenticated session, `page_viewed` on navigation to any tracked page (`app.ts`), `whos_that_round_completed` from the Who's That Pokémon page (the one event with no real server-owned hook, since the server never otherwise learns a round's outcome).
- **Metrics computed** (`services/adminAnalyticsService.js`'s `computeEngagementStats`/`computeRetention`, both pure functions over one `AppEvent` fetch): DAU/MAU (unique authenticated users active today / in the last 30 days), page-view and session-start over-time series, per-feature adoption counts, AI request success rate by feature (parsed from each event's own metadata), and real Day-1/7/30 cohort retention (a trainer only counts toward `eligible` once that many real days have actually passed since their first-ever event — never estimated for a cohort still mid-window).
- **Privacy**: `metadataJson` never stores AI conversation content, Trainer Notes, full support messages, raw search queries, tokens, client-supplied ids, or emails — only short, purpose-specific fields (e.g. `{"difficulty":"hard","result":"win"}`).
