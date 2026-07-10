# Pokémon Trainer Hub

A web app for registering as a "Pokémon Trainer," exploring Pokémon (via [PokeAPI](https://pokeapi.co/)), and building a personal Dream Team of up to 5 creatures that persists across sessions.

Beyond the core Dream Team, the app includes: an Explorer with search/type filter/sort, a Favorites list, drag-and-drop team management with a Head-to-Head comparison modal, a Trainer Profile, a Team Card, a rule-based AI Trainer Assistant, a Battle Simulation against a randomly-generated opponent, and a Starter Quiz that recommends Pokémon based on your answers. None of these use mock or hardcoded data — every screen is backed by real PokeAPI data and/or the user's own rows in SQL Server.

## Tech Stack

- **Client:** Angular (standalone components, signals)
- **Server:** Node.js + Express
- **Database:** SQL Server (via Docker), accessed through Prisma ORM
- **Auth:** Auth0 (Universal Login) — the client obtains an access token via `@auth0/auth0-angular`, the server validates it via `express-oauth2-jwt-bearer`
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
                                  my-team, manage-team, profile, ai-trainer-assistant,
                                  battle, starter-quiz, not-found
  src/app/shared/                navbar, account-menu, pokemon-detail-modal,
                                  team-swap-modal, quiz/, guards, etc.
  src/app/core/                  HTTP services (team, favorites, profile, pokemon)

pokemon-trainer-hub-server/
  server.js                     App setup, mounts routers
  routes/                       pokemon.js, team.js, favorites.js, profile.js, notes.js
  services/                     prisma.js (DB client), pokeapi.js (fetch + cache),
                                 teamService.js, favoritesService.js
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

**`GET /api/profile`** — the current user's profile. `404` if not created yet. Only safe, user-facing fields are ever returned — never the internal row id or the Auth0 subject/user id.

**`POST /api/profile`** — creates or updates (upsert) the profile.
Body (all required unless noted): `trainerName, favoriteType, experienceLevel, firstName, lastName, dateOfBirth, country`, plus optional `avatarPokemonId` (a real Pokédex id used as a profile icon) and `teamName` (custom Dream Team name).
`400` if any required field is missing.

**`PATCH /api/profile/starter-quiz`** — marks the current user's Starter Quiz as completed (`hasCompletedStarterQuiz: true`). Real, server-side, tied to the JWT-identified user — not client-side storage, so it survives across devices/browsers. `404` if the trainer has no profile row yet.

### Trainer Notes

Free-text notes a trainer can attach to any Pokémon (not just team/favorited ones) — a running log, not a single editable note per Pokémon.

**`GET /api/notes/:pokemonId`** — the current user's notes for that Pokémon, most recent first.

**`POST /api/notes/:pokemonId`** — body `{ text }`. Always creates a new note. `400` if `text` is empty.

**`DELETE /api/notes/:noteId`** — deletes one note by its own id, scoped to the current user (can't delete another trainer's note by guessing an id). `204` on success.
