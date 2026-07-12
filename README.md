# Pokémon Trainer Hub

A web app for registering as a "Pokémon Trainer," exploring Pokémon (via [PokeAPI](https://pokeapi.co/)), and building a personal Dream Team of up to 5 creatures that persists across sessions.

Beyond the core Dream Team, the app includes: an Explorer with search/type filter/sort, a Favorites list, drag-and-drop team management (Manage My Team) with a Head-to-Head comparison modal, a Trainer Profile, a Settings page (theme, colorblind mode, email preferences, privacy/consent record, account), a **real LangChain + Gemini-backed AI Trainer Assistant** (team analysis, "find by description", and a global floating chat widget available on every page), AI-generated Dream Team name suggestions, a Battle Simulation against a randomly-generated opponent (with animated round reveals), a Starter Quiz and a daily "Who's That Pokémon?" quiz, and a Support page with a DB-backed contact form. None of these use mock or hardcoded data — every screen is backed by real PokeAPI data and/or the user's own rows in SQL Server. Where a mockup implied fabricated data (e.g. a numeric Pokémon "level," invented rival trainers), the real version was built on the closest equivalent that actually exists (real Power/type stats, a randomly-generated real opponent) instead.

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
                                  ai-trainer-assistant, battle, starter-quiz,
                                  whos-that-pokemon, not-found
  src/app/shared/                navbar, account-menu, assistant-chat (global floating
                                  chat widget), pokemon-detail-modal, pokemon-compare-modal,
                                  team-swap-modal, team-name-generator-modal, policy-modal,
                                  potd-card, loading-screen, colorblind, app-settings,
                                  team-power.ts / team-matchup.ts (shared calculations),
                                  quiz/, guards, etc.
  src/app/core/                  HTTP services (team, favorites, profile, pokemon,
                                  assistant, notes, quiz, support)
  e2e/                           Playwright end-to-end tests (see e2e/README.md)

pokemon-trainer-hub-server/
  server.js                     App setup, mounts routers
  routes/                       pokemon.js, team.js, favorites.js, profile.js, notes.js,
                                 assistant.js, support.js, quiz.js
  services/                     prisma.js (DB client), pokeapi.js (fetch + cache),
                                 teamService.js, favoritesService.js, assistantService.js
                                 (LangChain/Gemini), rateLimiter.js, teamNameFallback.js,
                                 ageRange.js
  middleware/                   auth.js (jwtCheck)
  prisma/                       schema.prisma, migrations/
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

## Testing

Both sides have unit tests; neither needs a real database, Auth0 tenant, or Gemini key to run.

```bash
# Server — native Node test runner (services + route-level tests)
cd pokemon-trainer-hub-server
npm test
```

Server tests fall into two kinds:
- **Service/utility tests** (`services/*.test.js`) — pure logic: age-range bucketing, the team-name fallback generator, the rate limiter, the Gemini-backed assistant service's fallback behavior (mocking the model call, never a real Gemini request).
- **Route-level tests** (`routes/*.test.js`) — exercise the real Express router and its error-code mapping through `supertest`, with `middleware/auth.js` and the relevant service module swapped for test doubles via Node's built-in module mocking (`node:test`'s `mock.module`, hence the `--experimental-test-module-mocks` flag baked into the `test` script) — so these never touch a real Auth0 tenant or a real database.

```bash
# Client — Angular's vitest-based unit-test builder
cd pokemon-trainer-hub-client
npm test
```

Client tests cover shared, framework-independent calculation logic (`shared/*.spec.ts`): Team Power/Tier/Type-Coverage math and the real-type-chart-driven Battle Readiness/Matchup Analysis formulas.

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

Auth0's **Allowed Callback URLs**, **Logout URLs**, and **Web Origins** must include the Vercel URL alongside `localhost:4200` (not replacing it, so local dev keeps working).

### Deployment health check

**`GET /api/health/db`** confirms the deployed backend can actually reach the database (not just that the Node process is up) — see the Health section below.

## API Reference

All endpoints except `/api/health` require a valid Auth0 access token: `Authorization: Bearer <token>`. The user is always identified server-side from the token's subject claim — no endpoint accepts or trusts a user id sent by the client. Missing/invalid tokens get a `401`. Unexpected server errors return a `500` with a generic message (details are logged server-side, never sent to the client).

### Health

**`GET /api/health`** — no auth required. Confirms the server process is up — does not touch the database.
Response: `{ "status": "ok", "message": "..." }`

**`GET /api/health/db`** — no auth required. Confirms the server can actually reach the database (used to verify the Render → Azure SQL connection after deploying). Deliberately returns nothing beyond ok/error — no row data, counts, or connection details, even on failure.
Response: `{ "status": "ok", "db": "ok" }`, or `503 { "status": "error", "db": "error" }` on failure.

### Pokémon

**`GET /api/pokemon`** — search/browse, proxied from PokeAPI with in-memory caching.

Query params (all optional):
| Param | Values | Default |
|---|---|---|
| `search` | substring match on name | — |
| `type` | e.g. `fire`, `water` | — |
| `sort` | `id` \| `name` \| `strongest` | `id` |
| `page` | page number | `1` (20 results/page) |

Response: `{ results: Pokemon[], page, pageSize, total }`
Errors: `400` for an unknown `type`, `502` if PokeAPI is unreachable.

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
