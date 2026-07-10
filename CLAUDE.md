# Pokémon Trainer Hub — Project Context for Claude Code

## What this project is
A web app where users register as "Pokémon Trainers," explore Pokémon data
(from PokeAPI), and build/manage a personal Dream Team of up to 5 creatures
that persists across sessions. This is a 3-day take-home assignment for a job
interview at Ness, given by Assaf.

## Tech Stack (decided, do not change without asking)
- **Client:** Angular (standalone components, routing)
- **Server:** Node.js + Express (JavaScript) — NOT ASP.NET Core / C#.
  We started with ASP.NET Core and explicitly switched to Node.js because
  the developer doesn't write C#. Everything should be JavaScript/TypeScript
  end to end.
- **Database:** SQL Server, running locally via Docker (container name:
  `pokemon-sql`, port 1433, SA password: `Pokemon2026!`)
- **ORM:** Prisma (`prisma` + `@prisma/client`) — chosen as the JS-native
  equivalent of Entity Framework Core.
- **Auth:** Auth0 (Universal Login) — NOT a custom-built auth system.
  - Auth0 tenant already created.
  - An Auth0 "Application" (SPA type) already created for the Angular client,
    with Callback/Logout/Web Origin URLs set to `http://localhost:4200`.
  - An Auth0 "API" (audience) still needs to be created for the Express
    server to validate tokens against.
  - Client uses `@auth0/auth0-angular` (already installed).
  - Server will use `express-oauth2-jwt-bearer` (already installed) to
    validate incoming JWTs.
- **AI (optional/nice-to-have only):** LangGraph, for a combined "AI Trainer
  Assistant" feature (team analysis + free-text Pokémon search). Not core.

## Project structure
```
pokemon-trainer-hub/
├── pokemon-trainer-hub-client/     ← Angular app
└── pokemon-trainer-hub-server/     ← Node.js/Express app
```

## Current status (as of end of Day 1 setup)
- [x] Angular project created, `@auth0/auth0-angular` installed
- [x] Node.js/Express project created (`pokemon-trainer-hub-server`),
      with `express`, `cors`, `dotenv`, `express-oauth2-jwt-bearer`,
      `prisma`, `@prisma/client` installed
- [x] Basic `server.js` with a `/api/health` route, confirmed working
      (`node server.js` → listens on port 3000)
- [x] SQL Server running in Docker (`pokemon-sql` container, port 1433)
- [x] Auth0 tenant + SPA Application created and configured
- [x] Git repo cleaned to a single initial commit, pushed to GitHub
      (https://github.com/tomer1408/pokemon-trainer-hub)
- [ ] Prisma not yet initialized / connected to the DB — this is the next
      immediate step
- [ ] Auth0 API (audience) not yet created
- [ ] Auth0 wiring not yet done in either client or server code
- [ ] No PokeAPI calls made yet from the server

## Git workflow — please follow this
We use a feature-branch workflow. For each task:
```bash
git checkout main
git pull
git checkout -b feature/<short-task-name>
# ...work, commit...
git push -u origin feature/<short-task-name>
git checkout main
git merge feature/<short-task-name>
git push
git branch -d feature/<short-task-name>
git push origin --delete feature/<short-task-name>
```
We are currently on branch `feature/db-setup`, about to run `npx prisma init`.

## Day 1 remaining tasks (in order)
1. `npx prisma init` in `pokemon-trainer-hub-server`, configure `.env` with
   the SQL Server connection string (using the Docker container above)
2. Define Prisma schema: `DreamTeamMember` model (id, auth0UserId,
   pokemonId, pokemonName, spriteUrl, addedAt)
3. Run first migration (`npx prisma migrate dev`)
4. Create the Auth0 API (Applications → APIs → Create API) to get an
   audience identifier
5. Wire Auth0 into Angular (`provideAuth0()` in `app.config.ts`) and
   Express (`express-oauth2-jwt-bearer` middleware in `server.js`)
6. Smoke test: login → Auth0 redirect → callback → valid token received
   and validated by the Express server. Must work before Day 2 starts.
7. Test a single call to PokeAPI (`GET /pokemon/pikachu`) to confirm data
   shape (stats, types, sprites, base_experience, cries)
8. Basic server-side caching for PokeAPI responses (e.g. `node-cache`)

## Product spec reference
The full PRD (18 sections: problem, personas, user stories, functional/
non-functional requirements, data model, all 12 screen specs, 3-day work
plan, prioritization table, risks) exists as a separate Word document
(`PRD_Pokemon_Trainer_Hub.docx`). Ask the user to share its contents if you
need deep detail on a specific screen or requirement — don't assume detail
that isn't in this file.

## Key product decisions worth remembering
- Team is capped at 5 Pokémon; a head-to-head comparison modal appears when
  trying to add a 6th.
- Type-distribution bar on My Team: dual-type Pokémon count toward BOTH
  types, normalized so the bar sums to 100%.
- Team Power is shown on both Home (glance-level: number + tier label)
  and My Team (detailed: number + per-Pokémon breakdown) — same shared
  calculation, not duplicated logic.
- Pokémon Detail page includes a cry-sound play button, sourced from
  PokeAPI's `cries.latest` field (fallback to `cries.legacy`).
- Nice-to-have backlog (build only 2-3, don't try all): Surprise Me button,
  simplified Battle Simulation (vs. a randomly generated opponent team, no
  turns/moves/HP — just a power comparison), Team Cover Image, Favorites
  list, Starter Style Quiz, AI Trainer Assistant.
- Explicitly OUT of scope: a full battle engine (moves, turns, HP,
  accuracy/crits, status effects), social features, native mobile app.

## Working style preferences
- Explain what each step does AND why, in plain language — the user wants
  to be able to explain every part of the code in a follow-up interview,
  not just have it work.
- Follow the feature-branch git workflow above for every task, don't commit
  directly to `main`.
- Don't reintroduce ASP.NET Core / C# / EF Core — the stack decision to use
  Node.js/Express/Prisma is final for this project.