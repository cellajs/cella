# yjs — collaborative editing relay

Standalone WebSocket relay for real-time collaborative editing of entity descriptions (BlockNote) via the Yjs CRDT protocol. The relay is the **single writer** for descriptions during collaboration: it seeds fresh sessions from the entity's stored content and materializes edits back into the entity row — clients never seed and never persist.

> This document covers the relay worker and the full collaborative editing flow end to end. For the surrounding sync engine (CDC, SSE, offline queue, HLC merge) see [SYNC_ENGINE.md](../cella/SYNC_ENGINE.md).

Clients connect with an HMAC-signed token. The relay verifies the token, authorizes the edit **locally** using the shared permission engine (`shared/src/permissions`) against an RLS-scoped DB read — no backend round-trip — and relays binary Yjs sync and awareness messages between peers. Document content is parsed only at the session boundaries: **seeding** (description → Y.Doc on first sync) and **materialization** (Y.Doc → description via a secret-gated internal backend endpoint, debounced with the state save).

## TL;DR

```text
User opens a task description
        ▼
WS connect to relay (token + async entity authz)
        ▼
Fresh session? Relay seeds Y.Doc from entity.description
        ▼
Keystrokes merge via CRDT, fan out to peers instantly
        ▼
Relay saves state + materializes changes (3s debounce, one call
per doc regardless of how many people type)
        ▼
Backend re-derives fields, stamps server HLC, Postgres commits
        ▼
CDC → SSE → non-editing viewers update
        ▼
Last client leaves → grace → final materialization → row deleted
(deletion is GATED on the durable record absorbing the session)
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Collaborative editing architecture                      │
├──────────────────────────────────────────────────────────────────────────────┤
│   Browser A                                 Browser B                        │
│  ┌──────────────────────────┐          ┌──────────────────────────┐          │
│  │ BlockNote editor         │          │ BlockNote editor         │          │
│  │   └ Y.Doc (CRDT)         │          │   └ Y.Doc (CRDT)         │          │
│  │ (no client persists —    │          │                          │          │
│  │  the relay is the single │          │                          │          │
│  │  writer for description) │          │                          │          │
│  └──────────────┬───────────┘          └────────────┬─────────────┘          │
│                 │  WS: y-protocols sync + awareness (cursors)                │
│                 ▼                                   ▼                        │
│      ┌─────────────────────────────────────────────────────────┐             │
│      │                 Yjs relay worker (yjs/)                 │             │
│      │                                                         │             │
│      │  upgrade      HMAC token check, then async entity authz │             │
│      │               (shared permission engine, RLS-scoped);   │             │
│      │               sync messages buffered until verified     │             │
│      │  relay        binary fan-out to peers, awareness        │             │
│      │               rate-limited (2/s per client)             │             │
│      │  seeding      fresh session → description column →      │             │
│      │               blocksToYDoc → initial doc state          │             │
│      │  save (3s)    binary state → yjs_documents; changed?    │             │
│      │   └ materialize  yDocToBlocks → POST internal endpoint  │             │
│      │  cleanup      last leave + grace → FINAL materialization│             │
│      │               gates row deletion; boot sweep recovers   │             │
│      │               crash-orphaned sessions                   │             │
│      └────────┬───────────────────┬─────────────────┬──────────┘             │
│               ▼                   ▼                 │ POST /yjs/materialize  │
│    ┌───────────────────┐ ┌───────────────────┐      │ (x-yjs-secret)         │
│    │ yjs_documents     │ │ entity table      │      ▼                        │
│    │ (session state,   │ │ description       │ ┌───────────────────────────┐ │
│    │  ephemeral)       │ │ (read for seed)   │ │ API backend               │ │
│    └───────────────────┘ └─────────▲─────────┘ │ permission re-check,      │ │
│                                    │           │ sanitize media URLs,      │ │
│                                    └───────────│ derive fields, server HLC │ │
│                                                └────────────┬──────────────┘ │
│                                                             ▼                │
│   Postgres commit → CDC worker → SSE → non-editing viewers update            │
│   (Yjs-owned fields suppressed on clients with an active editor)             │
└──────────────────────────────────────────────────────────────────────────────┘
```

Two data paths, both relay-driven:

- **The CRDT path** is the live truth during a session: keystrokes merge character-level and reach peers in milliseconds.
- **The materialization path** persists the session into the entity's `description` column plus server-derived fields (summary, checkbox counts, keywords). The relay diffs its merged state once per save window and makes **one** internal call per document — write amplification is O(1) per doc, not O(active editors). The backend runs the standard update pipeline on behalf of the window's last editor: permission re-check, media-URL sanitization, authoritative derivation, server-HLC stamping, CDC/SSE.

Clients keep exactly two responsibilities in collab mode: rendering/merging via the editor, and registering for SSE suppression so a slightly stale snapshot can't overwrite the fresher local doc. There is no client-side debounce, flush, or unload heuristic left.

## What a user goes through

| # | What the user sees | What happens underneath |
|---|--------------------|-------------------------|
| 1 | Opens a project or workspace | `YjsTokenFetcher` pre-fetches an HMAC edit token per entity type + tenant (30 min TTL, refreshed at 25 min and on tab wake) |
| 2 | Clicks a task card to edit | Client checks collab eligibility (relay configured, online, token present, unconditional update permission), then opens a ref-counted WS connection for that task |
| 3 | A brief faded preview (≤3 s) | Relay verifies the token at upgrade and authorizes entity access asynchronously — sync messages are buffered until verified. If the first sync doesn't land within 3 s, the client falls back to a standalone editor with a toast |
| 4 | Existing description appears | Fresh session: the relay seeds the Y.Doc from the stored description server-side. Rejoining an active session: stored session state syncs down |
| 5 | Types; sees peers' cursors | Edits merge via CRDT and broadcast to all peers; cursor/presence via awareness messages (rate-limited) |
| 6 | Pauses typing (~3 s) | The relay saves the doc state and materializes it: one internal backend call persists description + derived fields on behalf of the last editor; CDC → SSE updates everyone *not* editing |
| 7 | A colleague opens the same task | They sync the identical doc from the relay and appear as a cursor — no matter how many people type, materialization stays one call per window |
| 8 | Presses Escape or clicks away | Card returns to expanded view; the client writes a cache-only optimistic summary so the card updates instantly — the relay's authoritative materialization arrives via SSE moments later |
| 9 | Navigates away / closes / **refreshes mid-typing** | Nothing to lose client-side: the relay holds the doc and materializes it regardless of any client's fate. Client keeps the connection 30 s (instant remount); the relay keeps the doc 5 min after the last client leaves, then runs a **final materialization that gates row deletion** |

## Server-side seeding

Fresh sessions are seeded by the relay, not by clients. In `handleSyncStep1`, when no `yjs_documents` row exists (only reachable after entity authorization), the relay loads the entity's `description` column — via the same fork-agnostic `information_schema` introspection as `permissions.ts`, so any entity table with a `description` column participates — converts it with `@blocknote/server-util`'s `blocksToYDoc` into the `document-store` fragment, and inserts it as the row's initial state.

Two guarantees make this safe:

- **Schema parity.** The relay builds its BlockNote schema from the same React-free configs the frontend editor uses (`shared/blocknote-schema-configs`), so the ProseMirror node specs are identical — verified by round-trip tests covering every custom block type.
- **One canonical seed.** Concurrent first-connectors each generate a seed, but the insert is `ON CONFLICT DO NOTHING` and every connector re-loads the row afterwards — everyone adopts the winner's seed.

The seed also initializes the **materialization diff baseline**, so seed-only sessions (opened, never edited) never trigger a backend call.

## Server-side materialization

The relay's 3 s debounced save gained a second job: after persisting the binary state, it converts the same snapshot to blocks JSON, diffs against the session's last materialized content, and — only when changed — POSTs to the backend's secret-gated `/yjs/materialize` endpoint (same shared-secret pattern as the CDC worker's internal channel). The backend synthesizes a context for the window's **last editor**, re-checks update permission (defense in depth — access may have been revoked mid-session), **sanitizes untrusted media URLs instead of rejecting** (a rejection could never converge and would wedge cleanup), and runs the entity's standard update operation. An empty `fieldTimestamps` makes the stx pipeline stamp a **server HLC** for the description, so LWW semantics against offline solo edits stay coherent.

Convergence is guaranteed, not best-effort:

- **Cleanup gating.** The 5-min grace timer runs a final materialization *before* deleting the session row. Backend unreachable (`retry`) → the row stays and cleanup reschedules. Entity deleted / permission revoked (`permanent`) → deletion proceeds (the content can never converge, by design).
- **Startup sweep.** Rows orphaned by a relay crash are recovered at boot: edited rows (tracked via `last_edited_by`) are materialized then deleted; seed-only rows are deleted directly. Double-materialization across instances is harmless — unchanged content no-ops server-side and HLC LWW converges the rest.

## Preventing data loss

The durability model has three layers. The **Y.Doc** is the live truth while a session runs — every connected client holds a complete copy. The **relay's Postgres row** provides session continuity (3 s debounced save, kept 5 min after the last leave). The **entity's `description` column** is the durable record — and since the relay itself materializes it, the record converges **by construction**: no client has to survive, flush, or behave for typed content to reach the database. The remaining loss window is the relay's own 3 s save debounce, and only when clients *and* relay die inside it.

| Scenario | How it's handled | Worst case |
|----------|------------------|------------|
| Two people type in the same paragraph | Character-level CRDT merge — both edits survive | None |
| **Type, then refresh/close/kill the tab instantly** | Irrelevant to durability — the relay materializes within ~3 s regardless of any client's fate | None |
| Author closes the editor normally | Cache-only optimistic summary renders instantly; the relay's materialization lands via SSE moments later | None |
| Network drops mid-session | Editor falls back to solo mode (REST + offline queue); the relay materializes whatever the session had | None |
| Backend down while people edit | Materialization retries every save window; session cleanup is **blocked** until the durable record absorbs the session | Summary lags until the backend recovers — content is never lost |
| Relay restarts mid-session | Clients hold complete docs, reconnect, re-push; the boot sweep materializes crash-orphaned sessions | ≤3 s window lost only if relay *and* all clients die together |
| Relay unreachable for one user while others collaborate | That user edits solo via REST; the collab session's next materialization supersedes their description version | Known rarity: solo edits made *during* an active collab session don't enter the shared doc |
| Untrusted media URL injected into the Y.Doc | Backend sanitizes (blanks the URL) and persists — materialization never wedges on validation | Offending media renders empty |
| Entity deleted / permission revoked mid-session | Materialization returns permanent-failure; cleanup proceeds without resurrecting | None |
| SSE update arrives while someone is editing | Yjs-owned fields are stripped from incoming SSE writes while an editor is registered | None |
| Edit token expires mid-session | Provider picks up refreshed tokens on reconnect; circuit breaker (5 failures) falls back to solo mode | None — the relay already materialized the session |
| Stale session state vs. newer description | Sessions are ephemeral: rows are deleted only after materialization, and the next session re-seeds from the durable description | None |

## Connection lifecycle

1. Client connects: `ws://host:port/{entityId}?token=...&entityType=...&tenantId=...`
2. Relay verifies the HMAC token at upgrade (bad credentials are rejected before the WS handshake, keeping client backoff intact)
3. Entity-level access is authorized asynchronously (shared permission engine over an RLS-scoped read); sync messages are buffered until verified, awareness passes through
4. Fresh doc → server-side seed from the entity's description
5. Sync/update messages are relayed to peers; state is debounce-saved and materialized to the entity row
6. Awareness (cursor/presence) messages are rate-limited and broadcast
7. On last disconnect, the grace timer runs a final materialization that gates deletion of the session row

**WS close codes:** `4001` invalid token · `4003` access denied · `4400` bad request / missing entity scope · `4503` authorization unavailable (DB/resolver error)

## Tuning defaults

| Knob | Value | Where |
|------|-------|-------|
| Relay state save + materialize debounce | 3 s | `src/constants.ts` |
| Relay doc grace after last leave | 5 min | `src/constants.ts` |
| Cleanup retry when backend is down | 5 min (reuses grace) | `src/sync/session-manager.ts` |
| Awareness rate limit | 2/s per client | `src/constants.ts` |
| Client connection grace (instant remount) | 30 s | `frontend .../yjs-connections.ts` |
| Sync wait before solo fallback | 3 s | `frontend .../task-update-form.tsx` |
| Edit token TTL / refresh | 30 min / 25 min | backend + `yjs-token-fetcher.tsx` |
| Token-failure circuit breaker | 5 consecutive | `frontend .../yjs-connections.ts` |

## File structure

```
yjs/src
├── yjs-worker.ts                Entry point
├── constants.ts                 Tuning defaults + DocContext
├── env.ts                       Zod env variables
├── server
│   ├── ws-server.ts             HTTP + WS server lifecycle
│   ├── upgrade.ts               WS upgrade (param validation, auth, access)
│   ├── auth.ts                  HMAC token verification
│   └── health.ts                HTTP health endpoint
├── sync
│   ├── relay.ts                 Binary y-protocols relay + seeding + save/materialize
│   ├── materialize.ts           Y.Doc → blocks diff + internal backend POST
│   ├── sweep.ts                 Boot-time recovery of crash-orphaned sessions
│   └── session-manager.ts       Active connections per doc, materialization-gated cleanup
├── data
│   ├── permissions.ts           Local entity authorization via shared permission engine
│   ├── entity-content.ts        Description-column loader for server-side seeding
│   ├── storage.ts               Y.Doc state CRUD against yjs_documents table
│   └── db.ts                    PG pool with RLS context helper
├── lib
│   ├── blocknote-seed.ts        Server-side BlockNote schema + blocks ↔ Y.Doc conversion
│   ├── pino.ts                  Structured logger
│   └── tracing.ts               OpenTelemetry SDK + health metrics
└── tests/                       Unit + integration tests (seed round-trip, materialization, sweep)
```

The backend counterpart lives in `backend/src/modules/yjs/` (token issuing, the `/yjs/materialize` internal endpoint, media-URL sanitization) and `backend/src/modules/yjs/yjs-materializers.ts` (per-entity materializer registry — entities register in their module file, e.g. `task-module.ts`).

## Scripts

```sh
pnpm dev          # Development with watch mode
pnpm build        # Production build via tsup
pnpm start        # Run production build
pnpm start:dev    # Run with tsx (no build)
pnpm ts           # Type-check
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
```
