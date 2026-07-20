# yjs: collaborative editing relay

Standalone WebSocket relay for real-time collaborative editing of entity descriptions (BlockNote) via the Yjs CRDT protocol. The relay is the **single writer** for descriptions during collaboration: it seeds fresh sessions from the entity's stored content and materializes edits back into the entity row; clients never seed and never persist.

This document covers the relay itself. For the surrounding sync engine (CDC, SSE, offline queue, HLC merge) and the client-side collab flow (token fetching, solo fallback, SSE suppression), see [Sync engine](/docs/page/architecture/sync-engine).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Collaborative editing architecture                      │
├──────────────────────────────────────────────────────────────────────────────┤
│   Browser A                                 Browser B                        │
│  ┌──────────────────────────┐          ┌──────────────────────────┐          │
│  │ BlockNote editor         │          │ BlockNote editor         │          │
│  │   └ Y.Doc (CRDT)         │          │   └ Y.Doc (CRDT)         │          │
│  │ (no client persists;     │          │                          │          │
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
- **The materialization path** persists the session into the entity's `description` column plus server-derived fields (summary, checkbox counts, keywords). The relay diffs its merged state once per save window and makes **one** internal call per document: write amplification is O(1) per doc, not O(active editors). The backend runs the standard update pipeline on behalf of the window's last editor: permission re-check, media-URL sanitization, authoritative derivation, server-HLC stamping, CDC/SSE.

Clients keep exactly two responsibilities in collab mode: rendering/merging via the editor, and registering for SSE suppression so a slightly stale snapshot can't overwrite the fresher local doc. There is no client-side debounce, flush, or unload heuristic left.

## Connection lifecycle

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

1. Client connects: `ws://host:port/{entityId}?token=...&entityType=...&tenantId=...`
2. Upgrade validation runs **before the WS handshake**, in order: required params → HMAC token (timing-safe signature check + expiry) → token/param `entityType` and `tenantId` match → per-user connection rate limit (20 per 60 s, Postgres-backed with an in-memory insurance fallback). Rejections are written as a raw HTTP response and the socket ends without completing the handshake; accept-then-close would fire the client's `onopen` and reset its reconnect backoff into a fast retry loop.
3. Entity-level authorization runs **after** the socket opens, asynchronously: the shared permission engine evaluates an RLS-scoped read of the entity row and the user's memberships (no backend round-trip). Sync messages are buffered until the verdict lands (capped at 100 messages ≈ 200 KB; overflow is dropped); awareness passes through unbuffered because it is ephemeral and never persisted.
4. Fresh doc → server-side seed from the entity's description
5. Sync/update messages are relayed to peers; state is debounce-saved and materialized to the entity row
6. Awareness (cursor/presence) messages are rate-limited and broadcast
7. On last disconnect, the grace timer runs a final materialization that gates deletion of the session row

**WS close codes:** `4001` invalid/expired token · `4003` access denied (token scope mismatch or entity authorization) · `4400` bad request / missing entity scope · `4429` connection rate exceeded · `4503` authorization unavailable (DB/resolver error)

## Sessions & state

- Rooms are keyed `{entityType}:{entityId}`, one session per entity, held in a process-local map together with the client set, timers, pending state, and the materialization baseline.
- **No resident server-side Y.Doc.** The relay stores and manipulates raw binary Yjs updates with `Y.mergeUpdates` / `Y.diffUpdate` / `Y.encodeStateAsUpdate`; a throwaway `Y.Doc` is instantiated only at the parse boundaries (seeding and materialization). Sync step 1 answers the client's state vector with a computed diff, falling back to the full state if the stored update is corrupt.
- Incoming updates are **broadcast to peers first**, then merged into the session's pending state; the 3 s debounce folds any number of edits from any number of clients into one state save plus one materialization per window.
- **Storage is an overwrite snapshot, not an update log.** Every save writes the freshly merged full state over `yjs_documents.state` (one row per entity, unique on entity type + id). There is no server-side per-edit history (undo/redo lives in the clients) and compaction is implicit in the merge-on-save.
- A failed save merges the snapshot back into pending state for the next window; a within-window cache of the DB state avoids redundant reads. Reconnects inside the grace window reuse the warm session and its pending state.

## Server-side seeding

Fresh sessions are seeded by the relay, not by clients. In `handleSyncStep1`, when no `yjs_documents` row exists (only reachable after entity authorization), the relay loads the entity's `description` column (via the same fork-agnostic `information_schema` introspection as `permissions.ts`, so any entity table with a `description` column participates), converts it with `@blocknote/server-util`'s `blocksToYDoc` into the `document-store` fragment, and inserts it as the row's initial state.

Two guarantees make this safe:

- **Schema parity.** The relay builds its BlockNote schema from the same React-free configs the frontend editor uses, in `shared/src/utils/blocknote-schema-configs.ts`, so the ProseMirror node specs are identical, verified by round-trip tests covering every custom block type.
- **One canonical seed.** Concurrent first-connectors each generate a seed, but the insert is `ON CONFLICT DO NOTHING` and every connector re-loads the row afterwards: everyone adopts the winner's seed.

The seed also initializes the **materialization diff baseline**, so seed-only sessions (opened, never edited) never trigger a backend call.

## Server-side materialization

The relay's 3 s debounced save has a second job: after persisting the binary state, it converts the same snapshot to blocks JSON, diffs against the session's last materialized content and, only when changed, POSTs to the backend's secret-gated `/yjs/materialize` endpoint (same shared-secret pattern as the CDC worker's internal channel). The backend synthesizes a context for the window's **last editor**, re-checks update permission (defense in depth: access may have been revoked mid-session), **sanitizes untrusted media URLs instead of rejecting** (a rejection could never converge and would wedge cleanup), and runs the entity's standard update operation. An empty `fieldTimestamps` makes the stx pipeline stamp a **server HLC** for the description, so LWW semantics against offline solo edits stay coherent.

The backend's verdict drives retry behavior: 2xx → done; 4xx → **permanent** (entity deleted, permission revoked, or no materializer registered; never retried, cleanup may proceed); 5xx or a network failure → **retry** (the session row is kept and the attempt reschedules). Unparseable stored state also maps to permanent, so a corrupt doc can't wedge cleanup. Attribution is deliberately coarse: `editedBy` is the last writer in the save window, not per-change.

## Cleanup & sweep

When the last client disconnects, a 5 min grace timer starts (quick reconnects reuse the warm session). Cleanup then awaits any in-flight save, flushes remaining pending state, and runs a **final materialization that gates row deletion**: a `retry` verdict keeps the row and reschedules cleanup (reusing the 5 min interval); `ok` or `permanent` proceeds to delete the session row and drop the in-memory session.

A **startup sweep** recovers rows orphaned by a relay crash: rows older than the grace window that carry `last_edited_by` and non-empty state held real edits and are materialized before deletion (`retry` keeps them for the next boot or session); rows without never diverged from their seed and are deleted directly. Double-materialization across instances is harmless: unchanged content no-ops server-side and HLC LWW converges the rest.

The sweep deliberately queries pool-direct **without RLS context** (it must see all tenants); if the worker's DB role enforces RLS, the sweep silently degrades to a no-op.

## Durability

The durability model has three layers. The **Y.Doc** is the live truth while a session runs: every connected client holds a complete copy. The **relay's Postgres row** provides session continuity (3 s debounced save, kept 5 min after the last leave). The **entity's `description` column** is the durable record. Since the relay itself materializes it, the record converges **by construction**: no client has to survive, flush, or behave for typed content to reach the database. The remaining loss window is the relay's own 3 s save debounce, and only when clients _and_ relay die inside it.

| Scenario | How it's handled | Worst case |
| --- | --- | --- |
| Two people type in the same paragraph | Character-level CRDT merge; both edits survive | None |
| **Type, then refresh/close/kill the tab instantly** | Irrelevant to durability: the relay materializes within ~3 s regardless of any client's fate | None |
| Author closes the editor normally | Cache-only optimistic summary renders instantly; the relay's materialization lands via SSE moments later | None |
| Network drops mid-session | Editor falls back to solo mode (REST + offline queue); the relay materializes whatever the session had | None |
| Backend down while people edit | Materialization retries every save window; session cleanup is **blocked** until the durable record absorbs the session | Summary lags until the backend recovers; content is never lost |
| Relay restarts mid-session | Clients hold complete docs, reconnect, re-push; the boot sweep materializes crash-orphaned sessions | ≤3 s window lost only if relay _and_ all clients die together |
| Relay unreachable for one user while others collaborate | That user edits solo via REST; the collab session's next materialization supersedes their description version | Known rarity: solo edits made _during_ an active collab session don't enter the shared doc |
| Untrusted media URL injected into the Y.Doc | Backend sanitizes (blanks the URL) and persists; materialization never wedges on validation | Offending media renders empty |
| Entity deleted / permission revoked mid-session | Materialization returns permanent-failure; cleanup proceeds without resurrecting | None |
| SSE update arrives while someone is editing | Yjs-owned fields are stripped from incoming SSE writes while an editor is registered | None |
| Edit token expires mid-session | Provider picks up refreshed tokens on reconnect; a client-side circuit breaker falls back to solo mode | None: the relay already materialized the session |
| Stale session state vs. newer description | Sessions are ephemeral: rows are deleted only after materialization, and the next session re-seeds from the durable description | None |

## Constraints

- **Live collaboration is process-local.** Sessions, pending state, and peer broadcast all live in one process's memory. Two clients connected to _different_ relay instances for the same entity do not see each other's edits live, and their debounced saves overwrite each other (last write wins). The code guarantees safety of the durable record across instances (idempotent materialization, HLC LWW, `ON CONFLICT` seeding), not live convergence. **Run a single instance, or route all connections for an entity to the same instance (sticky/entity-affinity routing).**
- **One doc per entity.** The room key and the `yjs_documents` unique key are both entity type + id; nothing supports multiple docs per entity.
- **No server-side history.** Storage is a merged snapshot; anything needing per-edit history must live client-side.
- **Fragment and schema lockstep.** The Y.Doc fragment name (`document-store`) and the server-side BlockNote schema must match the frontend editor binding and the shared schema configs, or seeds stop round-tripping.
- **Seeds are server-generated only and never merged.** Concurrent first-connectors resolve via `ON CONFLICT DO NOTHING` plus a canonical re-load; merging two independently generated seeds would duplicate content.
- **Authorization is optimistic and asynchronous.** The socket opens before the entity verdict; sync messages buffer behind the verified flag (100-message cap; a slow verify can silently drop overflow), and awareness bypasses the gate.
- **RLS expectations differ by path.** Normal operations run tenant-scoped (`app.tenant_id` / `app.user_id` set per connection); the sweep runs pool-direct and cross-tenant by design.
- **Materialization is eventual.** The 3 s debounce plus retry semantics mean the durable description can lag the live doc; a persistently unreachable backend keeps session rows alive and retries every 5 min. Only product entities with a registered materializer can materialize; anything else is a permanent failure.

## Health

The HTTP server starts before backend readiness checks so the platform sees the port immediately. `GET /health` returns 204; `GET /health?depth=full` returns a JSON snapshot (status, version, uptime, connection/document/client counts, event-loop lag) where status derives from event-loop lag: 100 ms or more is degraded, 1 s or more unhealthy. Every other path is a 404.

## Tuning defaults

Worker-side knobs only: client-side knobs (connection grace, solo-fallback timeout, token TTL/refresh, token circuit breaker) live in the frontend and are covered in [Sync engine](/docs/page/architecture/sync-engine).

| Knob | Value | Where |
| --- | --- | --- |
| State save + materialize debounce | 3 s | `src/constants.ts` |
| Doc grace after last leave (also the materialize-retry interval) | 5 min | `src/constants.ts` |
| Awareness rate limit | 2/s per client | `src/constants.ts` |
| Connection rate limit | 20 per user / 60 s | `src/server/rate-limiter.ts` |
| Max WS payload | 2 MB | `src/server/ws-server.ts` |
| Pre-verification message buffer | 100 messages | `src/sync/relay.ts` |

## Environment

Validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (RLS-scoped reads + `yjs_documents` writes) |
| `DATABASE_SSL_CA` | Base64 PEM CA to verify Postgres TLS; required in production |
| `YJS_SECRET` | HMAC secret for WS tokens and the `x-yjs-secret` materialize header (min 16 chars) |
| `YJS_PORT` | WS/HTTP port (defaults to the port in `appConfig.yjsUrl`, else 4002) |
| `YJS_DB_POOL_MAX` | pg pool size (default 20) |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | Run without DB-backed paths (in-memory rate limiter) |
| `NODE_ENV` / `PINO_LOG_LEVEL` / `DEBUG` | Runtime mode, log level, debug flag |

The backend counterpart lives in `backend/src/modules/yjs/` (token issuing, the `/yjs/materialize` internal endpoint, media-URL sanitization), including `yjs-materializers.ts` (per-entity materializer registry; entities register in their module file, e.g. `task-module.ts`).

## Related docs

- [Architecture overview](/docs/page/architecture)
- [Sync engine](/docs/page/architecture/sync-engine)
