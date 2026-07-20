# Admin Dashboard — Plan & Status

Living document for the Admin Dashboard build. Kept in the repo (not just
Claude Code's internal plan file) so the full plan and current status
survive across sessions/days. Update the **Status** section as each phase
lands — the phase descriptions below are the agreed, final scope after
several rounds of correction; treat them as the source of truth over
anything said earlier in conversation.

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Admin authorization foundation | ✅ Done, tested, **committed locally** on `feature/admin-phase0-authorization` (not merged/pushed) |
| 1 | Schema migration + Support Request management + AdminLayout/sidebar | ✅ Done, tested, **committed locally** (`1648016`) |
| 2 | Trainer management | ✅ Done, tested, **committed locally** (`cbcffa2`) |
| 3 | Admin Overview (real KPIs) | ✅ Done, tested, **committed locally** (`b713bbd`) |
| 4 | System Health | ✅ Done, tested, **committed locally** (`60a3f82`) |
| 5 | Analytics | ✅ Done, tested, **committed locally** (`59221c1`) |
| 6 | Database Explorer | ✅ Done, tested, **committed locally** (`12f8d61`) |
| 7 | Tests/docs/final verification pass | ✅ Done, tested, **not yet committed** |
| 8 | Product Analytics Tracking (DAU/MAU/retention/page-views) | 🔭 Deferred — scoped below, **not approved, not started** |

**Design source of truth:** Claude Design project `229f2acb-d143-4263-a151-ae50d008f03c`, file `Admin Dashboard.dc.html` (1,845 lines, covers all 6 areas + sidebar/header shell). Use it as the authoritative visual spec per phase — colors/spacing translated into this app's own existing CSS-variable system (`--bg/--surface/--text-body/--primary/--accent/--success/--error/--warning/--info`), not copied as raw hex.

**Standing rules that apply to every phase (do not relax without the user explicitly saying so):**
- One phase at a time; stop and report after each; no next phase without separate explicit approval.
- No commit without explicit approval. No push/merge/deploy ever without explicit approval.
- Baseline tests+build recorded before a phase's changes; post-change results reported against that baseline so regressions are never confused with pre-existing issues.
- No Admin UI ever renders a full raw Auth0 user id — always masked/truncated; a "Copy ID" action may copy the real value without displaying it.
- Server-side authorization (`requirePermission`) is the only real gate; client-side permission checks (`AdminService`/`adminGuard`) are UX convenience only and fail closed (default to zero permissions) on every error mode.
- `adminGuard` is generic — reads the required permission from `route.data['permission']`, never hardcoded to one permission — so a future limited-scope Admin role isn't incorrectly blocked.
- No future admin route sits beneath a parent route whose own guard requires a specific permission (that would block other roles); a shared `AdminLayout` is a visual-only wrapper — each leaf route declares and enforces its own permission independently.
- SQL Server + Prisma has no native `enum` support — status/priority-type fields are validated `String` with a server-side allowlist.

**Permission mapping (final, corrected):**
- `admin:read` → Overview (Phase 3), Analytics (Phase 5), System Health (Phase 4)
- `support:manage` → all of Support Requests (Phase 1)
- `users:manage` → all of Trainers: list, detail, Auth0 info, account deletion (Phase 2)
- `database:read` → all of the Database Explorer (Phase 6)

## Auth0 manual setup (done once, applies to all phases)

1. APIs → your API → Settings → enable **RBAC** + **Add Permissions in the Access Token**.
2. APIs → your API → Permissions → add `admin:read`, `support:manage`, `users:manage`, `database:read`.
3. User Management → Roles → create "Admin" role → assign all 4 permissions.
4. Assign that role to your own Auth0 user. **Log out and back in** after any permission/role change — cached tokens keep the old claim otherwise.
5. Verify by decoding the real access token **locally** (browser DevTools — never a third-party site like jwt.io) and confirming the `permissions` array is actually present.

## Phase 0 — Admin authorization foundation ✅

- Server: `middleware/requirePermission.js` (401 if `req.auth?.payload` missing, 403 if the permission isn't in the token's `permissions` array — fails closed on a malformed/missing claim too), `routes/admin.js` (`GET /api/admin/ping`, the only route so far).
- Client: `shared/jwt-decode.ts` (base64url decode, returns null on any malformed input), `core/admin.ts` (`AdminService` — `permissions$`/`permissions` signal/`hasPermission()`, fails closed on every async failure mode), `shared/admin-guard.ts` (generic, `route.data['permission']`-driven), `pages/admin/overview` (Phase 0's placeholder — Phase 3 replaces its contents at the same route), `pages/admin/access-denied` (guarded by `authGuardFn` only, never `adminGuard`, so it can't loop), conditional "Admin" link in the account menu.
- Verified end to end manually in-browser (real token → real 200) in addition to 172/172 server + 563/563 client automated tests.

## Phase 1 — Schema migration + Support Request management + AdminLayout ✅

- Migration `add_admin_support_and_audit`: `SupportRequest` gains `status`/`priority`/`adminNotes`/`assignedTo`/`resolvedAt`/`updatedAt`; new `AdminAuditLog` model.
- Server: `services/adminAudit.js` (`logAdminAction` + `getAuditTrail`), `services/adminSupportService.js` (list/getById/update, validates status/priority allowlists, audit-logs only real changes, sets/clears `resolvedAt` on status transitions), `routes/adminSupport.js` (`GET /`, `GET /:id` — enriched with real audit history for the drawer, `PATCH /:id`, all `support:manage`). Original `message`/`name`/`email` immutable — never read off the PATCH body at all.
- Client: this phase also introduces the shared `AdminLayout` (sidebar + header, per the mockup) since Support is the first real destination page and needs a navigational home — decided explicitly with the user rather than assumed. Sidebar shows all 6 areas gated per-item by `admin.hasPermission(item.permission)` (not just `admin:read`); only Overview + Support are functional this phase, the rest render as present-but-disabled ("Soon"). New shared components introduced here (first genuine 2nd/3rd duplicate, worth extracting): `Pagination`, `StatusBadge`, `ConfirmDialog` (generalizes the ad hoc pattern already used in `manage-team.ts`/`settings.ts` — Settings' Delete Account dialog was refactored onto it, net simplification). These three are self-contained (`isLight`/`isPikachu` inputs + their own `:host` token block, same convention as `AccountMenu`/`LoadingScreen`) rather than relying on inherited CSS vars, since they need to render correctly regardless of which page embeds them.
- Routing: `/admin` is now a parent route (`AdminLayout`, `authGuardFn` only — no permission of its own) with children `''` (Overview, `admin:read`) and `support` (`support:manage`), each independently guarded — never inheriting a blanket permission from the parent.
- **Real bug found and fixed during this phase**: the app-wide `<app-navbar>` (Home/Explorer/My Team/My Profile + its own theme switcher) was still rendering on top of AdminLayout's own header/sidebar, since `/admin` wasn't in `app.ts`'s `NAVBAR_HIDDEN_ON` check — two stacked navbars and two theme switchers on the same page. Fixed by hiding the app-wide navbar (and the floating AI chat widget, which shares the same `@if`) on any `/admin`-prefixed route.

## Phase 2 — Trainer management ✅

- Server: `services/adminTrainerService.js` (`list` paginates `TrainerProfile`, then exactly 3 scoped `groupBy` queries on DreamTeamMember/Favorite/BattleMatch merged in JS — never one query per row; `getDetail` reuses `teamService.getTeam()`, real win/loss/difficulty breakdown from `BattleMatch`, the trainer's own support requests (metadata only, no message body), excludes `TrainerNote` content entirely). `auth0Management.js` gained `getAuth0User` (a genuine read). `routes/adminTrainers.js`: `GET /`, `GET /:id`, `GET /:id/auth0` (a real `GET`, not the earlier-mistaken `POST refresh-auth0`), `DELETE /:id` (reuses the existing `accountService.deleteAccount` unmodified, audit-logged). All `users:manage`.
- Client: `shared/mask-auth0-id.ts` — a real, reusable masking helper (new, since this is the first phase that needs to render Auth0 ids on screen at all) enforcing the standing rule everywhere an id is shown; Trainers list + detail page (Profile / Auth0 info-on-demand / Product Activity / Support Requests / Danger Zone sections). Delete reuses the shared `ConfirmDialog` with "type the trainer's name to confirm," exactly like the self-service flow. Trainers is now a real, enabled sidebar link (was "Soon" in Phase 1) — `AdminLayout`'s `currentItem`/active-highlight logic was extended so a trainer detail sub-route (`/admin/trainers/:id`) still counts as being on "Trainers", not just the exact list path.
- List deliberately never shows email — `TrainerProfile` doesn't store it (Auth0 is the sole source of truth), and fetching it per row would mean one Management API call per trainer on every page load. It's available on demand per-trainer via the detail page's "Refresh Auth0 Info" action instead.

## Phase 3 — Admin Overview

- `services/adminOverviewService.js`: one function, real `count`/`groupBy` KPIs (7-day windows), 5 most recent support requests, ~10 most recent real cross-model events. `GET /api/admin/overview` (`admin:read`) — one response, not N calls. Replaces Phase 0's placeholder page content at the same `/admin` route.

## Phase 4 — System Health

- `services/adminHealthService.js`: reuses the real in-process DB check + latency; a real PokeAPI ping; Gemini/Sentry reported as **"Configured"/"Not Configured"** from env var presence — deliberately never "Operational" (that would require a real paid call this page shouldn't make on every load). Surfaces `process.version`, `NODE_ENV`, latest migration folder name (real, via `fs.readdirSync`), `RENDER_GIT_COMMIT` if present else "unknown". `GET /api/admin/system` (`admin:read`).
- Client: 4 visually separate sections (Runtime/Errors/Build/External deps) + a small constants file for external dashboard links (Sentry/Render/Vercel/UptimeRobot — bookmarks, not secrets).

## Phase 5 — Analytics ✅

- `services/adminAnalyticsService.js`: profiles/battles-over-time (bucketed in JS, UTC-anchored — this app's realistic data volume makes raw-SQL date-truncation unnecessary), the real funnel (profiles → quiz completed → ≥1 team member → =5 members → ≥1 battle), most-popular-Pokémon (`groupBy`), win/loss/difficulty/opponent-type distributions, Who's That streak stats, support-by-topic/status. `GET /api/admin/analytics?days=N` (`admin:read`).
- Client: `shared/hbar-list`, `shared/mini-bar-chart`, `shared/donut-chart` — small hand-rolled SVG/CSS charts (no new charting library), reused across the page's 4 sections (Growth, Battles, Pokémon Popularity, Support & Engagement) plus the Activation Funnel.
- **Explicit scope decision (confirmed with the user):** this phase only ever surfaces metrics computable from data the app already stores — profiles/quiz/team/battle counts and over-time series, popularity rankings, win/loss/difficulty/opponent-type distributions, Who's That streaks, support-by-topic/status, and the funnel above. It deliberately does **not** add or simulate DAU, MAU, retention, last-login/last-active, page views, session counts, or any not-yet-persisted feature/AI-usage counts — inferring these from incomplete data would violate this project's "no faked data" rule. Real infrastructure for those metrics is scoped separately below as **Phase 8**, deferred and not started. The Analytics page itself carries a short visible note saying the same thing, so this isn't just documented here.
- Recent/ranked lists (Overview's Recent Support/Recent Activity, Analytics' popularity/distribution rankings) are deliberately capped at ~5-10 entries — this is intentional dashboard design (a glanceable summary, not an attempt to hide a "load more"), not a missing feature. Where a full paginated version of the same data already exists elsewhere (e.g. Support Requests), the capped list links out to it (Overview's "All requests →").

## Phase 6 — Database Explorer ✅

- `services/adminDatabaseRegistry.js`: hardcoded whitelist, one entry per real model (`trainerProfiles, dreamTeamMembers, favorites, trainerNotes, supportRequests, battleMatches, avatarIcons, adminAuditLogs`) — pure metadata (no Prisma import of its own; `modelName` is looked up dynamically at query time in `adminDatabaseService.js`).
- Masking, stricter than "gated by `database:read` is enough", and applied **server-side** (a new `services/maskAuth0Id.js` — a server-side port of the client's `shared/mask-auth0-id.ts`, since this phase's masking must happen before the response ever leaves the API, not left to the client to render safely like Phase 2): `TrainerProfile.dateOfBirth`/`firstName`/`lastName` → `ageRange` only, never raw; `auth0UserId`/`adminAuth0UserId` masked on every table that has one; **`TrainerNote.text` never returned at all**, list or detail (only `id`/masked owner/`pokemonId`/`createdAt`/`textLength`); **`SupportRequest.message`/`name`/`email`** never returned — only a short `messagePreview` + metadata; `BattleMatch.roundsJson`/`teamSnapshotJson` are list-excluded but included in the detail shape (`toSafeDetail` override) for the client's JSON pretty-printer.
- Routes are **all `GET`**, hard constraint: no raw SQL, no arbitrary Prisma query construction, no create/update/delete/truncate, `:table` validated against the whitelist (404 if not listed, never passed through to Prisma), `pageSize` capped at 100.
- **Real bug found and fixed during this phase**: `getTableEntry()`'s original `REGISTRY[tableKey] ?? null` resolved `'__proto__'` to the real (inherited) `Object.prototype` instead of `null`, since `REGISTRY` is a plain object literal — a request for `/api/admin/database/__proto__` would have incorrectly passed the "is this a known table" check. Fixed with an explicit `Object.prototype.hasOwnProperty.call(REGISTRY, tableKey)` guard. Caught by a real test, not manually.
- Client: `core/admin-database.ts`, a genuinely model-agnostic `shared/admin-data-table` (columns derived from the real union of keys across the current rows — the one place in this feature that needs a fully dynamic grid, unlike Support/Trainers' fixed-column tables), and `pages/admin/database` — table-selector sidebar (real per-table counts), search, pagination, and a record-details drawer with prev/next navigation within the loaded page and a small JSON pretty-printer for any field whose value looks like a JSON string (used by `BattleMatch.roundsJson`/`teamSnapshotJson`). Database Explorer is now a real, enabled sidebar link.
- Note: unlike Phase 2's Trainers page, there's no "Copy real ID" action here — the raw `auth0UserId` never reaches the client at all in this phase (masked server-side before the response leaves the API), so there's no unmasked value left to copy.

## Phase 7 — Tests, docs, final verification ✅

- Audited (not re-derived from memory) every requirement below against the real test files before reporting anything done:
  - 401/403/200 coverage for every `/api/admin/*` route family — **found and fixed a real gap**: `routes/admin.test.js`, `adminSupport.test.js`, and `adminTrainers.test.js` (Phases 0-2) never had a direct in-file 401 test, unlike every later phase's route test; added one to each for consistency (the underlying 401 behavior was already covered once, in `middleware/requirePermission.test.js`, but not per-route).
  - Service unit tests, whitelist/masking/page-cap tests, audit-log-creation tests — already solid across every phase, confirmed via direct inspection (no gaps found).
  - `adminGuard` allow/deny/redirect cases — already comprehensive (`shared/admin-guard.spec.ts`: allows on a matching permission for 2+ different routes, redirects to `/admin/access-denied` on a missing permission, an empty permissions array, and a route declaring no permission at all).
  - Nav visibility, loading/empty/error states, filters, pagination, confirm-before-delete — already covered per page, confirmed via direct inspection of every `pages/admin/**/*.spec.ts` file (no gaps found).
- `README.md` — new "Admin Dashboard" section: what it is, the 4-permission Auth0 setup steps, the permission mapping table, the full `/api/admin/*` endpoint list, and a note on the deferred Phase 8.
- `npx prisma migrate status` — 15 migrations found, all applied, **"Database schema is up to date!"** (the shadow-DB-based `prisma migrate diff` sanity check needs a `shadowDatabaseUrl` this local setup doesn't have configured — `migrate status` against the real local DB answers the same "is there drift" question without spinning up new DB infrastructure unprompted).
- Full `npm test` both sides (298/298 server, 682/682 client) + production build, then a real end-to-end smoke check: server restarted fresh, all 7 `/api/admin/*` route families (`ping`/`support`/`trainers`/`overview`/`system`/`analytics`/`database/tables`) confirmed returning a real `401` with no token.
- **Comprehensive cross-phase verification pass (0-7), done at the user's explicit request after Phase 7's own report**: re-ran every test suite fresh (298/298 server, 682/682 client), re-ran the production build, cross-checked server-side route permissions against the client-side route/nav permissions and both docs (no mismatches), confirmed no leftover "Soon" sidebar placeholders, confirmed every admin service/shared component is actually referenced somewhere (no orphans), and re-ran the full live end-to-end smoke test (`/api/health` → 200, all 7 admin route families → 401, including the `__proto__` whitelist edge case). Found and fixed one real issue: this Status table had drifted — Phases 2-5 were already committed (`cbcffa2`/`b713bbd`/`60a3f82`/`59221c1`) but still showed "not yet committed" here. Also flagged (not fixed, since it lives in an already-committed Phase 0 file): the client's `AdminService.ping()` has had zero callers since Phase 3 replaced the Overview placeholder — the server route it hits (`GET /api/admin/ping`) stays genuinely useful as a manual auth-chain smoke test and is documented as such in the README, but the client method itself is dead code.

## Phase 8 — Product Analytics Tracking ✅

Built across 5 sub-phases after the design below was presented back to the
user for review and explicitly approved: (1) `AppEvent` schema +
`services/analyticsEventService.js` core (`logEvent`/`logEventSafe`/
`updateLastActive`), (2) server-owned events wired into the real routes/
services whose actions they describe, (3) `POST /api/events` — the one
client-facing route, its own smaller `CLIENT_ALLOWED_EVENT_TYPES` allowlist
and strict per-event metadata validation, (4) client instrumentation
(`core/analytics.ts`, `app.ts`'s session/page-view tracking,
`whos-that-pokemon.ts`'s round-completed event), (5) `adminAnalyticsService.js`'s
`computeEngagementStats`/`computeRetention` wired into the real Analytics
page. See README's "Product analytics tracking" section for the full
picture.

**Objective:** build the real data collection this app currently lacks, so
Analytics can eventually show DAU, MAU, last-active/last-login, Day 1/7/30
retention, page views, sessions, feature adoption, and AI request
success/failure rates — none of which exist today (Phase 5 deliberately
does not fake any of them).

**Metric definitions (must be finalized and reviewed before any code):**
- `DAU`: unique authenticated users with ≥1 approved activity event on a calendar day.
- `MAU`: unique authenticated users with ≥1 approved activity event in the last 30 days.
- `lastActiveAt`: most recent meaningful product action recorded for the trainer.
- `lastLoginAt`: most recent Auth0 authentication time — not the same as last activity.
- `page_view`: a recorded visit to an approved application page.
- `retention`: % of a user cohort that returns and performs an approved event N days later.

**Proposed schema (draft, subject to this repo's real Prisma/SQL Server constraints):**
```prisma
model AppEvent {
  id           Int      @id @default(autoincrement())
  auth0UserId  String?
  eventType    String
  pageName     String?
  metadataJson String?
  createdAt    DateTime @default(now())

  @@index([auth0UserId])
  @@index([eventType])
  @@index([createdAt])
}
```
Plus `TrainerProfile.lastActiveAt DateTime?`.

**Approved event registry (strict server-side allowlist — no arbitrary client-sent event names):**
`session_started`, `page_viewed`, `onboarding_completed`, `starter_quiz_completed`,
`pokemon_added_to_team`, `dream_team_completed`, `battle_completed`,
`whos_that_round_completed`, `ai_request_completed`, `ai_request_failed`,
`support_request_created`. Final list reviewed before implementation.

**Server-owned events** (generated server-side after the real action succeeds,
never trusting the client as source of truth): `battle_completed` only after
the battle is saved, `support_request_created` only after the DB insert,
`pokemon_added_to_team` only after the DB insert, `ai_request_completed`/
`ai_request_failed` from the real server-side result.

**Client-owned events** (limited to page/session/navigation signals): every
request server-validated — event type against the allowlist, page name
against an allowlist, metadata against a strict schema, the acting user id
taken from the verified token (never the request body), rate-limited,
oversized/unexpected payloads rejected.

**Privacy constraints — never stored in `AppEvent.metadataJson` or anywhere
in this pipeline:** AI conversation content, Trainer Notes, full support
messages, raw search queries, Access Tokens, client-supplied Auth0 ids,
email addresses, DB credentials, full URLs with query params. Metadata stays
minimal and purpose-specific (e.g. `{"difficulty":"hard","result":"win"}`,
never a full payload dump).

**`lastActiveAt` update strategy:** throttled (e.g. at most once per 15
minutes per user), not on every click/request — avoids write amplification
while still giving a useful recency signal.

**Retention limitations:** DAU/MAU/retention/page-view metrics only become
reliable from the moment this phase actually deploys — historic gaps are
never backfilled or reconstructed. Existing historical timestamps
(profile/battle/team-member/support-request `createdAt`) may power clearly
labeled partial historical metrics only, never presented as historic page
views, sessions, or active-user counts.

**Required workflow when this phase is eventually picked up:** present
metric definitions → present the full approved event registry → present the
schema/migration plan → explain privacy/retention decisions → explain
write-volume/performance implications → explain which events are
server-owned vs. client-owned → present the testing plan → wait for
explicit approval → implement as its own phase, its own commit, never
folded into an existing Admin phase.
