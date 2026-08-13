---
name: two-tab-sync-test
description: Drive two signed-in browser tabs with playwright to verify or diagnose realtime entity sync (CDC → SSE → lazy-sync scheduler → cache patch) at runtime.
---

# Two-tab realtime sync testing

Use when a live-sync symptom needs runtime evidence ("create doesn't show up in the other tab") or to verify sync changes end-to-end. The driver runs a fixed experiment matrix — rename control, create, delete-fresh, delete-preseeded, reload truth-check — and captures per-tab console, `seqCursor` network bodies, SSE connections, and screenshots.

## Preconditions

- Dev stack running. If starting it yourself, capture stdout — pino writes no file and you need it for magic-link URLs and backend errors: `pnpm dev > <scratch>/dev-stack.log 2>&1` (background). CDC worker must show `CDC WebSocket connected` in the log.
- Postgres probes: `psql postgres://postgres:postgres@0.0.0.0:5432/postgres` (substitute for backend logs; e.g. check a row's `seq`/`deleted_at` after an action).
- Never act in the org a human is currently testing in (watch the request log for their active org) — pick a different seeded org.

## Auth: session-cookie injection (no UI login)

Dev cookie: name `cella-development-session-v2`, value `{sha256hex(sessionToken)}.{sessionId}.` (trailing dot = no impersonation), `domain: localhost, path: /, httpOnly: true, secure: false, sameSite: 'Strict'` — set via `context.addCookies`, works for both :3000 and the :4000 API.

**Option A — bench user (deterministic, needs `pnpm --filter bench db:seed` run once):**
user 0 is admin of `xbench/xbench-org`; token `xbench-session-token-000000000000`, sessionId `00000000-0000-4000-a007-000000000000` → cookie value
`e08a3f990277c545edfa77756948ae130da52f0e5059ba5c30538486499be388.00000000-0000-4000-a007-000000000000.`
⚠️ xbench-org holds ~500 attachments, over the default org quota (100, `appConfig.defaultRestrictions.quotas.attachment`) → `createAttachments` returns **429 `restrict_by_org`**. Use option A for update/delete experiments only.

**Option B — any seeded org member via magic link (needed for create experiments):**
1. Pick an org + admin member: `SELECT o.tenant_id, o.slug, u.email FROM organizations o JOIN memberships m ON m.organization_id = o.id AND m.role='admin' JOIN users u ON u.id = m.user_id WHERE o.slug <> 'xbench-org' LIMIT 5;`
2. `curl -X POST http://localhost:4000/auth/magic/send -H 'content-type: application/json' -d '{"email":"<email>"}'` — MUST send browser-like `user-agent` + `origin: http://localhost:3000` headers or the bot check rejects with `maybe_bot`. Limit: 2 links/30min per email.
3. The link prints to backend stdout: `[magic-link] <email> <url>`. Invoke it with `curl -c jar.txt <url-with-:4000-and-/auth/invoke-token/...>` (302) and read the cookie value from the jar.

## Run

```
ORG_PATH=<tenantId>/<orgSlug> SESSION_COOKIE=<cookie-value> OUT_DIR=<scratch> \
  node cella/skills/two-tab-sync-test/two-tab-driver.mjs
```

Writes `evidence.json` (every console line / delta fetch / assert with ms timestamps) and `shots/*.png`. Tab A acts, tab B observes. Assert lines print PASS/FAIL live.

## Reading the evidence — which pipeline stage dropped the change

| Evidence | Meaning |
|---|---|
| `[handleEntityNotification] attachment:<action> priority=...` in tab B console | notification crossed SSE + BroadcastChannel |
| `Echo — patched stx, skipped data fetch` in tab A | acting tab suppressed its own event (correct; `sourceId` is per-tab, uuidv7 at page load) |
| `[CacheOps] Delta fetch: … patched N (seqCursor=a,b)` + network `GET …?seqCursor=a,b` | scheduler flushed and fetched |
| delta response `items` (id, name, `deletedAt`, seq) | payload truth — soft-delete tombstones DO ride the delta response (backend drops the `deletedAt` filter under `seqCursor`) |

Decision rule: **no console notification line** → SSE/leader/broadcast layer; **notification but no fetch** → scheduler/watermark (check `useSyncStore` seq slots); **fetch contains the row but UI unchanged** → cache-patch layer (`patchFetchedEntity` in `frontend/src/query/realtime/cache-ops.ts`).

Leader semantics: first tab owns the SSE connection (`Became leader`), others log `Not leader, listening to broadcasts only` — both process notifications independently. A tab viewing the org route is in the viewing tier (instant flush); hidden tabs get ~1s timer throttling from chromium, so use generous assert windows.

## Historical failure mode worth re-checking (fixed 2026-07-16, `d4bc3e9c0`)

The delta patch used to apply fetched rows with update/remove semantics only: a **new** row arriving via seq-range fetch was fetched then dropped, so live creates never appeared in other tabs and deleting such a row looked like a delete-sync failure. Fixed by the unified `applyServerEntity` applicator in `cache-ops.ts` (inserts into canonical scope lists; invalidates filtered lists once per flush when a row was new). If creates stop propagating again, check that applicator first. Details: `.todos/SYNC_FANOUT_DEVLOG.md`.

## Gotchas

- Upload button: match exact name `Upload` — `/upload/i` also hits the page-header "Upload cover" button and you end up in the org cover-image editor.
- Uppy dialog: hidden `input[type="file"]` inside the dialog; `setInputFiles` then click `.uppy-StatusBar-actionBtn--upload`. Use a tiny PDF (an image file opens the image-editor step). Upload succeeds without S3 (local-first fallback) — the `POST …/attachments` (201) is what matters.
- Table: rows virtualized (~15–20 in DOM), sorted `createdAt desc` so new rows land in the viewport. Selectors: row `.rdg-row`, name `span.truncate.font-medium`, row checkbox `[aria-label="Select"]`, rename = dblclick name cell → `input[data-slot="edit-cell-input"]` → Enter, delete = checkbox → destructive `Delete` bar button → confirm dialog `Delete`.
- Offline console noise: S3 thumbnail CORS failures + `[DownloadService] … marked as failed` are harmless. Large orgs also churn the presignedUrl rate limiter (2000/h/user) through thumbnail fetches.
- Backend request logging is silenced for the xbench tenant (bench identity) — use DB probes there.
- Leftovers: the driver soft-deletes one pre-seeded row and leaves probe rows tombstoned. `pnpm --filter bench db:seed` restores xbench; faker orgs are throwaway.
