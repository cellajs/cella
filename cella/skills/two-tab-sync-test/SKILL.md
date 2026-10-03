---
name: two-tab-sync-test
description: Drive two signed-in browser tabs with playwright to verify or diagnose realtime sync at runtime, for entity changes (CDC → SSE → fetch prioritizer → cache patch) and for collaborative descriptions (Yjs relay → saved row).
---

# Two-tab realtime sync testing

Use when a live-sync symptom needs runtime evidence ("create doesn't show up in the other tab", "typing doesn't reach the other editor") or to verify sync changes end-to-end. The driver runs a fixed matrix (rename control, create, delete-fresh, delete-preseeded, description typing and save, reload truth-check) and captures per-tab console, `seqCursor` network bodies, SSE and relay connections, screenshots.

## Preconditions

- Dev stack running in the checkout under test. The driver reads that checkout's URL and cookie name, and a linked git worktree runs on ports of its own (launch rules: the `verify` skill). If starting it yourself, capture stdout (pino writes no file; backend errors are there): `pnpm dev > <scratch>/dev-stack.log 2>&1` (background). The log must show `CDC WebSocket connected`.
- The description experiment needs the relay (`appConfig.services.yjs.enabled`, on by default).
- Postgres probes: `psql <DATABASE_ADMIN_URL from backend/.env>` (e.g. a row's `seq`, `deleted_at` or `description` after an action).
- Never act in the org a human is testing in (watch the request log for their active org); pick another seeded org.

## Auth: a minted session

No UI login, and no cookie built by hand: the app signs every cookie. The driver runs `pnpm --filter backend session:mint <EMAIL>` (development and test mode only), which prints `<cookie name>=<signed value>` and a curl line with the API URL. Cookie name, cookie version and port all come from the checkout's config, so none of them is written down here.

- **Default, the bench user** (needs `pnpm --filter bench db:seed` once): `xbench-user-0000@xbench.local` is admin of `xbench/xbench-org`. The seed sets that tenant's attachment quota to unlimited, so every experiment runs there, creates included.
- **Any other seeded org**: pick an admin and pass `EMAIL` and `ORG_PATH`.
  `SELECT o.tenant_id, o.slug, e.email FROM organizations o JOIN memberships m ON m.organization_id = o.id AND m.role = 'admin' JOIN emails e ON e.user_id = m.user_id WHERE o.slug <> 'xbench-org' LIMIT 5;`
  An org at its attachment quota (100 by default, `appConfig.defaultRestrictions.quotas.attachment`) answers creates with **429 `restrict_by_org`**.

## Run

From the repo root:

```
[EMAIL=<email>] [ORG_PATH=<tenantId>/<orgSlug>] OUT_DIR=<scratch> \
  node cella/skills/two-tab-sync-test/two-tab-driver.mjs
```

Writes `evidence.json` (every console line / delta fetch / assert, ms timestamps) and `shots/*.png`. Tab A acts, tab B observes. Asserts print PASS/FAIL live. The first line, `target`, names the URL and cookie in use: check it against the stack you mean to test.

## Reading the evidence: entity changes

| Evidence | Meaning |
|---|---|
| `[TabCoordinator] Acquired leader lock` in one tab, `[AppStream] Not leader, listening to broadcasts only` in the other | election ran; only the leader opens SSE (`sse-connect` GET; the POST on the same path is catchup) |
| `[handleEntityNotification] attachment:<action> viewing=<bool>` in tab B console | notification crossed SSE + BroadcastChannel |
| `Echo: patched stx, skipped data fetch` in tab A | acting tab suppressed its own event (correct; `sourceId` is per-tab, uuidv7 at page load) |
| `[CacheOps] Delta fetch: … patched N entities (seqCursor=a,b)` + network `GET …?seqCursor=a,b` | prioritizer flushed and fetched |
| delta response `items` (id, name, `deletedAt`, seq) | payload truth; soft-delete tombstones DO ride the delta (backend drops the `deletedAt` filter under `seqCursor`) |

Decision rule: **no console notification line** → SSE/leader/broadcast layer; **notification but no fetch** → fetch prioritizer/cursor (check the org and view seqs in `syncStore`, `frontend/src/query/realtime/sync-store.ts`); **fetch contains the row but UI unchanged** → cache-patch layer (`fetchRangeAndPatch` in `frontend/src/query/realtime/cache-ops.ts`).

Leader semantics: the first tab takes the Web Lock and owns the SSE connection, the others listen to its broadcasts; both process notifications independently. `Became leader, reconnecting...` follows whenever a tab gains leadership with no open stream: at startup, or when the leader tab closed. A tab on the org route is in the viewing tier (`viewing=true`, fetches at once); hidden tabs get ~1s timer throttling from chromium, so use generous assert windows.

Creates not propagating: check the `applyServerEntity` applicator in `cache-ops.ts` first (inserts new rows into canonical scope lists, invalidates filtered lists once per flush).

## Reading the evidence: descriptions

Typing does not ride the entity path. Keystrokes go editor → relay socket (`/yjs/<entityId>`) → the other editors. The relay saves the row 3s after the last keystroke (at most 10s while typing goes on), and that saved row then travels the entity path like a rename. Model: `cella/SYNC_ENGINE.md#yjs`, relay: `yjs/README.md`.

| Evidence | Meaning |
|---|---|
| `relay-http yjs/token` 200, then `relay-connect ws://…/yjs/<id>` in both tabs | each editor got a token and joined the document |
| EXP5 live: the typed text in tab B's editor | the relay broadcasts |
| `relay-http yjs/pull` or `yjs/push` | the socket is out of reach; the editor syncs over HTTP through the API |
| EXP5 saved: a `delta-fetch` item with `hasWatchedText: true` | the relay wrote the row and it crossed CDC → SSE → fetch |
| `descriptionSaved` after the reload | server truth |

Decision rule: **no `relay-connect`** → token or socket (the `yjs/token` status, the relay process, the `/yjs` proxy); **connected but no live text** → relay session and broadcast (`yjs/src/sync/relay.ts`); **live text but no saved row** → compaction and materialization (`yjs/src/sync/compaction.ts`, the backend's `/internal/yjs/materialize`); **saved row fetched but the cell is stale** → the cache rule for Yjs-owned fields (`registerYjsOwnedFields`).

The table cell of an editing tab proves no save: its own editor already patched the cache. Only the delta fetch and the reload show the server row.

## Gotchas

- Upload button: match exact name `Upload`; `/upload/i` also hits the page-header "Upload cover" button (org cover-image editor).
- Uppy dialog: hidden `input[type="file"]` inside the dialog; `setInputFiles` then click `.uppy-StatusBar-actionBtn--upload`. Use a tiny PDF (an image opens the image-editor step). Upload succeeds without S3 (local-first fallback); the `POST …/attachments` (201) is what matters.
- Table: rows virtualized (~15–20 in DOM), sorted `createdAt desc` so new rows are in the viewport. Selectors: row `.rdg-row`, name `span.truncate.font-medium`, row checkbox `[aria-label="Select"]`, rename = dblclick name cell → `input[data-slot="edit-cell-input"]` → Enter, delete = checkbox → destructive `Delete` bar button → confirm dialog `Delete`. Match a row by its exact name: bench rows are numbered, so `… 2` is also the start of `… 20`.
- Description editor: dblclick the row's description cell (find the column by its header) → sheet `[role="dialog"]` with the row name as heading → `.bn-editor[contenteditable="true"]`. Remote cursor labels sit inside the editor's text: cut `.bn-collaboration-cursor__base` before matching. On macOS `Meta+End` stops at the end of the visual line; `Meta+ArrowDown` is the document end.
- Relay outage: DevTools "Block request URL" and CDP `Network.setBlockedURLs` do not stop WebSocket handshakes. Route the socket with playwright (`context.routeWebSocket(/\/yjs\//, …)`: `connectToServer()` passes it through, closing the routed sockets drops it) or stop the relay process. `setBlockedURLs` does block the HTTP pull and push. `context.setOffline(true)` leaves an open socket open; the app's own online handler disconnects the editor.
- Two users (cursors, a member who may only read): one browser context per user, each with its own minted cookie. The driver's two tabs share one session.
- A description written through the API (an outside write) needs `stx.fieldTimestamps.description` as an HLC, `<ms>:<4+ digit counter>:<5 chars [0-9a-z]>`, else 400.
- Offline console noise: S3 thumbnail CORS failures + `[DownloadService] … marked as failed` are harmless. Large orgs also churn the presignedUrl rate limiter (2000/h/user) via thumbnail fetches.
- Backend request logging is off for the xbench tenant (bench identity); use DB probes there.
- Leftovers: the driver renames one row, soft-deletes one pre-seeded row, leaves a probe row tombstoned and a probe line in one description. `pnpm --filter bench db:seed` restores xbench; faker orgs are throwaway.
