# Pokémon Trainer Hub

A web app for registering as a "Pokémon Trainer," browsing Pokémon (via [PokeAPI](https://pokeapi.co/)), and building a personal Dream Team of up to 5 creatures that persists across sessions.

## Tech Stack

- **Client:** Angular (standalone components)
- **Server:** Node.js + Express
- **Database:** SQL Server (via Docker), accessed through Prisma ORM
- **Auth:** Auth0 (Universal Login) — the client obtains an access token via `@auth0/auth0-angular`, the server validates it via `express-oauth2-jwt-bearer`
- **External data:** PokeAPI, proxied and cached by the server

## Project Structure

```
pokemon-trainer-hub-client/     Angular app
pokemon-trainer-hub-server/
  server.js                     App setup, mounts routers
  routes/                       pokemon.js, team.js, favorites.js, profile.js
  services/                     prisma.js (DB client), pokeapi.js (fetch + cache)
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

Then run the first migration and start the server:

```bash
npx prisma migrate dev
node server.js
```

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

## API Reference

All endpoints except `/api/health` require a valid Auth0 access token: `Authorization: Bearer <token>`. Missing/invalid tokens get a `401` with `{ "message": "Unauthorized" }`. Unexpected server errors return a `500` with a generic message (details are logged server-side, never sent to the client).

### Health

**`GET /api/health`** — no auth required.
Response: `{ "status": "ok", "message": "..." }`

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

**`GET /api/pokemon/:id`** — single Pokémon, by numeric id or name.

Response shape (`Pokemon`):
```json
{
  "id": 25, "name": "pikachu", "baseExperience": 112,
  "stats": [{ "name": "hp", "value": 35 }, "..."],
  "types": ["electric"], "abilities": ["static", "lightning-rod"],
  "spriteUrl": "...", "cry": "..."
}
```
Errors: `404` if the Pokémon doesn't exist, `502` if PokeAPI is unreachable.

### Dream Team

Team is capped at **5** members.

**`GET /api/team`** — the current user's team, each member enriched with `stats`/`types`/`baseExperience`.

**`POST /api/team/:id`** — add a Pokémon (`:id` = pokemonId).
- `409 { reason: "DUPLICATE" }` if already in the team.
- `409 { reason: "TEAM_FULL" }` if the team already has 5 members.
- `404` if the Pokémon doesn't exist. `201` with `{ message, member }` on success.

**`DELETE /api/team/:id`** — removes the member. `204` on success (idempotent — no error if it wasn't there).

### Favorites

Same shape as Team, but **no size limit**.

**`GET /api/favorites`**, **`POST /api/favorites/:id`**, **`DELETE /api/favorites/:id`** — identical semantics to the Team endpoints above, minus the `TEAM_FULL` case.

### Trainer Profile

**`GET /api/profile`** — the current user's profile. `404` if not created yet.

**`POST /api/profile`** — creates or updates (upsert) the profile.
Body (all required): `trainerName, favoriteType, experienceLevel, firstName, lastName, dateOfBirth, country`.
`400` if any field is missing.
