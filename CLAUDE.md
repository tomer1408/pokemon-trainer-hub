# Pokémon Trainer Hub — Project Context for Claude Code

## What this project is
A web app where users register as "Pokémon Trainers," explore Pokémon data
(from PokeAPI), and build/manage a personal Dream Team of up to 5 creatures
that persists across sessions. This is a take-home assignment for a job
interview at Ness, given by Assaf.

## Tech Stack (decided, do not change without asking)
- **Client:** Angular (standalone components, signals, routing)
- **Server:** Node.js + Express (JavaScript) — NOT ASP.NET Core / C#.
  We started with ASP.NET Core and explicitly switched to Node.js because
  the developer doesn't write C#. Everything should be JavaScript/TypeScript
  end to end.
- **Database:** SQL Server. Local dev via Docker (container name:
  `pokemon-sql`, port 1433); production uses **Azure SQL Database** with the
  same Prisma schema and provider — no code differences between the two.
- **ORM:** Prisma (`prisma` + `@prisma/client`) — chosen as the JS-native
  equivalent of Entity Framework Core.
- **Auth:** Auth0 (Universal Login) — NOT a custom-built auth system. Fully
  wired end to end in both environments: the Auth0 tenant, SPA Application,
  and API (audience) all exist and are configured; the client obtains an
  access token via `@auth0/auth0-angular`, and every server route (except
  `/api/health`) validates it via `express-oauth2-jwt-bearer`. See the
  README's "Auth0 configuration" section for the exact setup steps if this
  ever needs to be redone (e.g. a new tenant).
- **AI Trainer Assistant:** Real **LangChain + Google Gemini**
  (`@langchain/google-genai`) integration, server-side only
  (`services/assistantService.js`) — the client never talks to Gemini
  directly or sends a Gemini key. It started as a rule-based/deterministic
  simulation (keyword matching + canned templates) and was later replaced
  with real model calls — don't assume the old simulation still describes
  the current behavior. Powers three things: the AI Trainer Assistant
  page's "Analyze My Team" / "Find by Description" (the model only ever
  picks a Pokémon **type** and writes reasoning text; the actual Pokémon
  returned is always looked up afterward from real PokeAPI data via the
  existing strongest-of-type logic, never something the model invented),
  the global floating chat widget mounted on every page (open-ended,
  multi-turn Q&A), and AI-generated Dream Team name suggestions
  (rate-limited to 5/trainer/hour, with a deterministic non-AI fallback
  generator if Gemini fails/is rate-limited/unavailable). LangGraph (the
  PRD's original aspirational plan) was never actually built — plain
  LangChain is what's really wired up; be ready to say so honestly if
  asked in the interview.

## Project structure
```
pokemon-trainer-hub/
├── pokemon-trainer-hub-client/     ← Angular app
└── pokemon-trainer-hub-server/     ← Node.js/Express app
```
See the README's "Project Structure" section for the full file layout
(pages, shared components, server routes/services). Current pages: landing,
callback, onboarding, home, explorer, my-team, manage-team, profile,
settings, support, ai-trainer-assistant, battle, battle-history,
starter-quiz, whos-that-pokemon, not-found.

## Current status
Core build is complete and deployed to production (Vercel + Render + Azure
SQL — see README's "Deployment" section for live URLs and setup). Every
screen is backed by real data (PokeAPI and/or the user's own SQL Server
rows) — no mock/hardcoded data anywhere. Auth0 is fully wired in both
environments. Work at this stage is screen-by-screen QA, bug fixes, and
nice-to-have polish, not new-feature scaffolding from scratch.

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
Only commit/push when the user explicitly asks — don't auto-commit or
auto-push after finishing a task; let the user test locally first
(`ng serve` / `node server.js`, both run manually with no auto-reload on
the server side — restart `node server.js` after any backend edit).

## Product spec reference
The full PRD (18 sections: problem, personas, user stories, functional/
non-functional requirements, data model, all 12 screen specs, 3-day work
plan, prioritization table, risks) exists as a separate Word document
(`PRD_Pokemon_Trainer_Hub.docx`). Ask the user to share its contents if you
need deep detail on a specific screen or requirement — don't assume detail
that isn't in this file.

Individual screens are also frequently spec'd via exported mockup files
(`*.dc.html`) that the user pastes in directly — treat a freshly pasted
mockup as the authoritative, current spec for that page, even if it
contradicts an earlier plan or an older mockup version of the same screen.
When about to build/redesign a specific page, ask the user to (re-)paste
that page's own mockup rather than relying on a general description or
stale context from earlier in the conversation.

## Key product decisions worth remembering
- Team is capped at 5 Pokémon; a head-to-head comparison modal appears when
  trying to add a 6th (the "overflow" swap flow). A separate, unforced
  "Compare with My Team" entry point also exists whenever the team has room
  (1-4 members) — it never forces a swap, just a plain Add to Team.
- The Pokémon Detail Modal's "On Team" state is an active red "Remove from
  Team" button (with a confirm dialog) once a Pokémon is already on the
  team, not a disabled label.
- Type-distribution bar on My Team: dual-type Pokémon count toward BOTH
  types, normalized so the bar sums to 100%.
- Team Power is shown on both Home (glance-level: number + tier label)
  and My Team (detailed: number + per-Pokémon breakdown) — same shared
  calculation, not duplicated logic.
- Pokémon Detail page includes a cry-sound play button, sourced from
  PokeAPI's `cries.latest` field (fallback to `cries.legacy`).
- Manage My Team has its own separate, already-unforced "⇄ Compare" flow
  (per team-slot / favorite / bench card) — deliberately distinct from the
  Explorer/Home/Starter Quiz "Compare with My Team" entry point above; don't
  merge the two. Nothing on this page reaches the backend immediately
  anymore — not a drag-to-trash removal (even after its own confirm dialog),
  a Compare/Swap pick, or a Favorites toggle. Everything (team AND
  favorites) is staged into draft state; only "Save Changes" commits
  anything real, and "Revert" restores the exact team + favorites the
  trainer had before this visit, even undoing already-confirmed removals.
  The confirmation dialogs themselves (trash removal, Save, Revert, leaving
  with unsaved changes) are unchanged — only the timing of the real
  backend write moved to Save.
- Trainer Profile edits are scoped to team/trainer-identity fields only
  (Trainer Name, Favorite Type, Experience Level, Team Name, Avatar) — first/
  last name, date of birth, and country are set once at onboarding and shown
  read-only afterward; policy acceptance is likewise permanent. Editing
  happens in an overlay modal with Save/Discard confirmations, not inline.
- The Settings page owns account-wide preferences that used to live (or
  were considered for) the Profile edit form: marketing email opt-in,
  viewing the Terms/Privacy acceptance record, Colorblind Mode, Theme, and
  a default for Battle's "show round explanations" toggle. Theme/Colorblind/
  Battle-default apply instantly (consistent with the Navbar/Account Menu
  controls they share real services with) — only the marketing checkbox is
  gated behind the Save bar, since it's the only one with a real API call
  that can fail.
- Nice-to-have backlog (original list, build only 2-3, don't try all):
  Surprise Me button, simplified Battle Simulation (vs. a randomly generated
  opponent team, no turns/moves/HP — just a power comparison), Team Cover
  Image, Favorites list, Starter Style Quiz, AI Trainer Assistant. Battle,
  Favorites, Starter Quiz, and AI Trainer Assistant are all built (the AI
  Assistant is now a real Gemini integration, not just simulated — see the
  Tech Stack section above); Team Cover Image and Surprise Me are the
  remaining unbuilt items from that original list. Beyond it, additional
  extras were also built: Battle History (a persisted match log, its own
  page), an AI Dream Team Name Generator, a daily "Who's That Pokémon?"
  quiz, a curated/categorized Avatar Icon picker backed by its own DB
  table (no more per-page-load PokeAPI calls for icons), and a Support page
  with a DB-backed contact form.
- Explicitly OUT of scope: a full battle engine (moves, turns, HP,
  accuracy/crits, status effects), social features, native mobile app.

## Working style preferences
- Explain what each step does AND why, in plain language — the user wants
  to be able to explain every part of the code in a follow-up interview,
  not just have it work.
- The user communicates in rapid-fire Hebrew (with typos) for quick
  follow-up tweaks, and switches to detailed English when giving a full
  spec or pasting a mockup. Narrate what you're about to do and why in
  Hebrew before each step, not just in English.
- Follow the feature-branch git workflow above for every task, don't commit
  directly to `main`. Don't push to production unless explicitly asked.
- Don't reintroduce ASP.NET Core / C# / EF Core — the stack decision to use
  Node.js/Express/Prisma is final for this project.
- No mock/hardcoded data, ever — every screen must be backed by real PokeAPI
  data and/or the user's own database rows. If a mockup shows something
  with no real data behind it (e.g. a fabricated XP/Level system, a fake
  Trainer ID number), say so and propose a real-data alternative rather
  than faking it silently.
