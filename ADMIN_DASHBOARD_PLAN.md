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
| 1 | Schema migration + Support Request management + AdminLayout/sidebar | ✅ Done, tested, **not yet committed** |
| 2 | Trainer management | ⏳ Not started |
| 3 | Admin Overview (real KPIs) | ⏳ Not started |
| 4 | System Health | ⏳ Not started |
| 5 | Analytics | ⏳ Not started |
| 6 | Database Explorer | ⏳ Not started |
| 7 | Tests/docs/final verification pass | ⏳ Not started |

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

## Phase 2 — Trainer management

- Server: `services/adminTrainerService.js` (`list` paginates `TrainerProfile`, then per-page scoped `count`/`groupBy` on DreamTeamMember/Favorite/BattleMatch merged in JS — no relation exists to join on; `getDetail` reuses `teamService.getTeam()`, excludes `TrainerNote` content). `auth0Management.js` gains `getAuth0User` (a genuine read). `routes/adminTrainers.js`: `GET /`, `GET /:id`, `GET /:id/auth0` (a real `GET`, not the earlier-mistaken `POST refresh-auth0`), `DELETE /:id` (reuses the existing `accountService.deleteAccount`, audit-logged). All `users:manage`.
- Client: trainers list + detail page. Auth0 ids masked everywhere (standing rule). Delete reuses the shared `ConfirmDialog` with "type the trainer's name to confirm."

## Phase 3 — Admin Overview

- `services/adminOverviewService.js`: one function, real `count`/`groupBy` KPIs (7-day windows), 5 most recent support requests, ~10 most recent real cross-model events. `GET /api/admin/overview` (`admin:read`) — one response, not N calls. Replaces Phase 0's placeholder page content at the same `/admin` route.

## Phase 4 — System Health

- `services/adminHealthService.js`: reuses the real in-process DB check + latency; a real PokeAPI ping; Gemini/Sentry reported as **"Configured"/"Not Configured"** from env var presence — deliberately never "Operational" (that would require a real paid call this page shouldn't make on every load). Surfaces `process.version`, `NODE_ENV`, latest migration folder name (real, via `fs.readdirSync`), `RENDER_GIT_COMMIT` if present else "unknown". `GET /api/admin/system` (`admin:read`).
- Client: 4 visually separate sections (Runtime/Errors/Build/External deps) + a small constants file for external dashboard links (Sentry/Render/Vercel/UptimeRobot — bookmarks, not secrets).

## Phase 5 — Analytics

- `services/adminAnalyticsService.js`: profiles/battles-over-time (bucketed in JS — this app's realistic data volume makes raw-SQL date-truncation unnecessary), the real funnel (profiles → quiz completed → ≥1 team member → =5 members → ≥1 battle), most-popular-Pokémon (`groupBy`), win/loss/difficulty/opponent-type distributions, Who's That streak stats, support-by-topic/status. `GET /api/admin/analytics` (`admin:read`).
- Client: small hand-rolled SVG charts (no new charting library). Explicitly omits DAU/MAU/retention/last-login/page-views — not measurable with current data, never faked.

## Phase 6 — Database Explorer

- `services/adminDatabaseRegistry.js`: hardcoded whitelist, one entry per real model (`trainerProfiles, dreamTeamMembers, favorites, trainerNotes, supportRequests, battleMatches, avatarIcons, adminAuditLogs`).
- Masking, stricter than "gated by `database:read` is enough": `dateOfBirth` → `ageRange` only; `auth0UserId` masked everywhere; **`TrainerNote.text` never returned at all**, in list or detail (only `id`/masked owner/`createdAt`/`textLength`); **`SupportRequest.message`/`name`/`email`** show only a safe preview + metadata — full content stays exclusive to the Phase 1 Support page.
- Routes are **all `GET`**, hard constraint: no raw SQL, no arbitrary Prisma query construction, no create/update/delete/truncate, `:table` validated against the whitelist (404 if not listed, never passed through to Prisma), `pageSize` capped at 100.

## Phase 7 — Tests, docs, final verification

- 401/403/200 coverage for every `/api/admin/*` family; service unit tests; whitelist/masking/page-cap tests; audit-log-creation tests. `adminGuard` allow/deny/redirect cases, nav visibility, loading/empty/error states, filters, pagination, confirm-before-delete on the frontend. README "Admin Dashboard" section. Full `npm test` both sides + production build + `prisma migrate diff` sanity check.
