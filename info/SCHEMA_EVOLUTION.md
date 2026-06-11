# Schema evolution implementation plan (doba lenses)

> **Status**: Implementation plan. Supersedes [RESEARCH_CACHE_BUSTING_clean.md](./RESEARCH_CACHE_BUSTING_clean.md).
> Mechanism: version-tolerant API boundary + local cache migration, built on [doba](https://github.com/karol-broda/doba) (`dobajs`) as the transform/registry engine.
> Related: [SYNC_ENGINE.md](./SYNC_ENGINE.md), [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## TL;DR

Breaking schema changes (e.g., rename `task.name` → `task.title`) are shipped as **append-only lens modules**. Each lens declares the change once; from that single declaration we derive:

1. **Request up-migration** (server edge, before validation) — old-shape `ops` upgraded, never stripped or 400'd
2. **Response down-migration** (server edge, per consumer version) — old clients keep reading old field names
3. **Client cache migration** (boot-time Dexie pass) — IndexedDB rows + queued mutations rewritten locally, no refetch
4. **Versioned OpenAPI specs** (build-time replay) — for fork mesh negotiation

doba provides the registry, graph path-finding, bidirectional migrations, pipe builder, schema identification, and hooks. We provide the lens module convention, the Cella integration seams, and the OpenAPI artifact.

**Two phases:**
- **Phase 1 — Internal version tolerance**: app's own offline clients survive deploys (PWA skew, mid-exam, offline queue replay)
- **Phase 2 — Fork mesh**: independently-deployed Cella forks interoperate via version negotiation

---

## Why doba (assessment summary)

Verified against doba source (`packages/doba`, v0.1.0):

| Requirement | doba support | Verified |
|---|---|---|
| Bidirectional lenses | `'v0<->v1': { forward, backward }` reversible migrations | `migration.ts`, `resolveMigrations` |
| Declarative single-source transform | pipe builder: `p.rename().map().drop().add()` | helpers docs + playground |
| Lens graph + shortest path (fork mesh) | BFS/Dijkstra, `cost`/`preferred`/`deprecated` edges, `findPath`, `explain()` | `graph.ts`, `registry.ts#L328` |
| Zod compat | Standard Schema v1 (`~standard.validate`); Cella ships Zod 4.4.3 (native SSv1) | `standard-schema.ts` |
| Browser + Node | Zero runtime deps, pure ESM, no Node APIs (`performance.now()` only) | package.json, registry source |
| Hot-path perf | `validate: 'none'` skips all schema validation; `from === to` fast path; graph precomputed at construction | `transformCore`, `transform()` |
| Tolerant reader | `identify` guard map + `tryParse` fallback, `identifyAndTransform()` | `registry.ts#L837-L926` |
| Telemetry | `hooks.onTransform/onStep/onWarning`, `ctx.warn`/`ctx.defaulted` → `result.meta.warnings/defaults` | `context.ts` |
| Error handling | Errors as values (`Result<T, DobaIssue[]>`), migrations that throw → `transform_failed` issue | `result.ts`, `transformCore` catch |
| Packaging quality | publint + arethetypeswrong in `prepublishOnly`, `files: [dist]` | package.json |

**Risk management for the dependency:**
- Pin exact version in `pnpm-workspace.yaml` catalog; review diffs on every bump.
- MIT, zero deps, ~10 source files → **vendoring into `shared/` is the documented escape hatch** if the project stalls.
- Write our integration behind a thin facade (`shared/src/version-changes/engine.ts`) so doba is swappable: only the facade imports `dobajs`.

**What doba does NOT provide (we build):**
- Lens module convention (frozen, append-only, date-ordered files)
- The `ops`-vs-`entity` dual-shape handling (see below)
- `stx.fieldTimestamps` key co-migration
- OpenAPI spec replay artifact
- Cache pointer + Dexie migration pass
- CI guards (append-only lint, oasdiff, config-collision validator)

---

## Architecture decisions

### D1: Two registries per entity type, one lens declaration

A product entity has **two wire shapes** that evolve together but are structurally different:

| Shape | Example | Used in |
|---|---|---|
| `entity` | full row: `{ id, title, labels: string[], stx, seq, ... }` | responses, SSE-triggered fetches, cached rows |
| `ops` | partial update: `{ title?: string, labels?: { add, remove } }` | update request bodies, queued offline mutations |

One `defineLens` declaration generates migrations for **both** doba registries. A field rename maps to: entity rename + ops rename + `stx.fieldTimestamps` key rename. Set fields additionally rename inside `{ add, remove }` deltas if values are affected (rare; usually only the key renames).

```ts
// shared/src/version-changes/engine.ts (facade — only file that imports dobajs)
interface EntityRegistries {
  entity: Registry<...>;  // nodes: 'v0', 'v1', ..., 'current'
  ops: Registry<...>;     // same node names, ops-shaped schemas
}
// built once at startup from the lens list, per product entity type
const registries: Record<ProductEntityType, EntityRegistries>;
```

### D2: Global schema version = lens count; per-entity nodes derived

- `currentSchemaVersion = lenses.length` (global ordinal, monotonic, baked into both bundles from `shared`).
- Per entity type, version **nodes** exist only where that entity changed: task lenses at global ordinals 3 and 7 → task nodes `v0` (pre-3), `v3`, `v7` (= current). A consumer at global version 5 maps to task node `v3` (latest task node ≤ 5). This keeps chains short and avoids no-op hops.
- Within the app, chains are linear → BFS. Fork mesh (Phase 2) adds branches → Dijkstra with `deprecated`/`cost` edges. Both are doba built-ins; nothing changes in our code.

### D3: Version is declared, not guessed

- **Client → server**: every SDK request carries `X-Client-Version: <ordinal>` (Phase 1) / peers send `Accept-Version` (Phase 2). The server *never* sniffs request shape.
- **Cache rows**: version comes from the persisted **cache pointer**, not from inspecting rows.
- doba `identify()` is used **only** as the tolerant-reader backstop for rows that escaped migration (crash mid-pass, follower-tab writes). Identify guards during an expand window can be ambiguous (both fields present) — acceptable for a backstop that prefers the newest matching node.

### D4: Canonical shape everywhere inside the boundary

- DB, handlers, CDC, activitiesTable, TTL entity cache, SSE notifications: **newest shape only**.
- TTL entity cache stores canonical enriched responses; `downgradeResponse` runs per-request *after* cache read (one O(fields) transform per hit, no per-version cache fragmentation).
- The **frozen envelope** is exempt from lensing and may only change via `apiVersion` bump: `stx`/`ops` wire structure, `StreamNotification`, `CatchupChangeSummary`, counter key formats (`s:{type}`, `e:{type}`), auth/session contract, SSE/WebSocket protocol. Enforced by CI guard (1.8).

### D5: Old schema versions are derived, not snapshotted

We never snapshot full entity Zod schemas per version. The doba registry's older schema nodes are **generated at startup** by reverse-applying each lens's declarative delta to the current canonical schema (`.omit()` / `.extend()` on Zod objects). Same replay logic powers the versioned OpenAPI artifact (2.1). Hot paths use `validate: 'none'`, so these derived schemas matter only for tests, tolerant-reader `tryParse`, and spec generation.

---

## Lens module anatomy

```text
shared/src/version-changes/
  engine.ts                              # doba facade: builds registries from lenses
  define.ts                              # defineLens factory + types
  index.ts                               # ordered registry (append-only imports)
  2026-07-01-task-name-to-title.ts       # frozen lens module
```

```ts
// shared/src/version-changes/2026-07-01-task-name-to-title.ts
// FROZEN once shipped — CI fails on edits. Append-only.
import { defineLens } from './define';

export default defineLens({
  id: '2026-07-01-task-name-to-title',
  entityType: 'task',
  description: 'Rename task.name → task.title',
  phase: 'expand', // 'expand' | 'contract' — drives spec + wire widening

  // Single declarative source. Everything below is DERIVED from it:
  // - doba entity migration (forward + backward via pipe-equivalent)
  // - doba ops migration (forward + backward)
  // - stx.fieldTimestamps key map
  // - OpenAPI spec delta (reverse replay)
  // - reverse-derived Zod schema for the older node
  delta: { rename: { from: 'name', to: 'title' } },

  // Optional escape hatches when delta alone can't express the change
  // (type conversions, splits/merges). Must be pure; receive ctx for
  // ctx.defaulted/ctx.warn telemetry (doba TransformContext).
  custom?: {
    entityForward?, entityBackward?,
    opsForward?, opsBackward?,
  },

  // Security flag: backward direction re-exposes removed data → forbid.
  lossyBackward?: boolean, // if true, downgradeResponse omits instead of restoring
});
```

Supported `delta` kinds (each with deterministic forward/backward/spec/timestamp derivations): `rename`, `add` (with default for backward-compat fill), `drop`, `retype` (requires `custom` converters), `setRename` (rename of an AWSet field).

The derived `fieldTimestamps` key map is applied wherever stx travels: request up-migration (incoming `stx.fieldTimestamps`), cache migration (stored entity `stx`), and queued mutation rewrite. **This closes the LWW-skew gap**: without it, a renamed scalar would lose its HLC history and an older offline edit could win.

---

## Phase 1 — internal version tolerance

### 1.0 Version stamp plumbing (blocker zero)

The server cannot down-migrate without knowing each consumer's version. Currently no request carries one.

- Add `currentSchemaVersion` export to `shared/src/version-changes/index.ts`; it's baked into each bundle at build time.
- **Frontend**: set `X-Client-Version` header in the fetch wrapper in [frontend/src/lib/api-client.ts](../frontend/src/lib/api-client.ts) (`createClientConfig`) — one place, covers the whole generated SDK. Also append to SSE stream connect URL (EventSource can't set headers) as `?cv=` query param.
- **Backend**: tiny middleware parses the header into `ctx.var.clientVersion` (default = current when absent → no-op path). Mounted globally in the core middleware chain.
- Log version distribution (otel counter keyed by version) from day one — this is the telemetry floor for "safe to contract" (1.9).

### 1.1 Lens package + doba registries

- Add `dobajs` to the `shared` package (pinned exact). `shared` is already consumed by backend, frontend, and cdc — single source of truth, ships atomically with each bundle.
- Implement `define.ts`, `engine.ts` (delta → doba migrations for both registries + timestamp key maps + reverse schema derivation), `index.ts` ordered list.
- `engine.ts` exposes the only API the rest of the codebase uses:

```ts
upgradeOps(entityType, ops, stx, fromVersion): { ops, stx }        // → current
downgradeEntity(entityType, entity, toVersion): entity              // current →
migrateCachedEntity(entityType, entity, fromVersion): entity        // → current (incl. stx keys)
migrateQueuedMutation(entityType, variables, fromVersion): variables
identifyAndMigrate(entityType, row): row | null                     // tolerant-reader backstop
currentSchemaVersion: number
versionNodeFor(entityType, globalVersion): string                   // D2 mapping
```

- All calls use `validate: 'none'` (zod-openapi / Dexie context validate elsewhere); `from === to` short-circuits in doba make the steady-state cost ~zero.
- Unit tests: round-trip property tests per lens (forward∘backward = identity modulo declared loss), timestamp-map consistency, derived-schema equality vs hand-written expectation.

### 1.2 Request up-migration (backend)

Seam: extension middleware chain ([backend/src/core/x-routes.ts](../backend/src/core/x-routes.ts)) runs **before** OpenAPIHono validation ([backend/src/utils/default-hook.ts](../backend/src/utils/default-hook.ts)).

- New middleware preset `xVersionTolerant(entityType)` (pattern: [backend/src/middlewares/entity-cache/presets.ts](../backend/src/middlewares/entity-cache/presets.ts)) applied to product-entity create/update routes:
  1. Read `ctx.var.clientVersion`; if current → next() (zero cost).
  2. Parse JSON body, call `upgradeOps()` (which co-migrates `stx.fieldTimestamps`).
  3. **Overwrite Hono's `bodyCache`** so `ctx.req.valid('json')` sees the upgraded body. This is the one hacky bit: implement as a small utility with a test that pins Hono's internal behavior, so a Hono upgrade that breaks it fails CI loudly instead of silently bypassing lenses.
  4. Migrations are pure key-shuffles on still-unvalidated input — Zod validation still runs after; lint rule forbids value logic / dynamic key access in lens code.
- During **expand** phase, `delta` also widens the route's ops schema (both field names accepted) so even clients that bypass the header (curl, tests) keep working — Postel's law at the schema level, generated from the lens, not hand-edited in module schemas.
- Create routes: same preset, applied to the full-body schema shape.

### 1.3 Response down-migration (backend)

- Same preset, response side: after the handler (and after the TTL entity-cache middleware caches the canonical shape), if `clientVersion < currentSchemaVersion`, run `downgradeEntity()` on response payloads (single entity, list `items`, and batch fetches).
- Implementation: wrap at the preset level by intercepting the response body for product-entity routes only — not a global serializer. Routes without the preset are untouched.
- `lossyBackward` lenses omit rather than restore removed fields (security: a field dropped for exposure reasons must not reappear for old clients).
- SSE notifications are **not** down-migrated (frozen envelope; they carry IDs and seqs, not entity fields). Catchup summaries likewise untouched.
- `droppedFields` in update responses pass through unchanged — but field names in it are down-migrated too (old client must recognize them).

### 1.4 Client cache pointer + boot migration pass

Seam: [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) — `PersistedMetaRecord.buster` is the reserved (always `''`) slot; product entities are per-query Dexie records; meta record holds `mutations` + `contextQueries`.

- `buster` now stores the **global schema ordinal** as string. Restore flow:
  1. `restoreClient()` reads meta; `pointer = Number(meta.buster || 0)`.
  2. If `pointer === currentSchemaVersion` → restore as today.
  3. If behind → **migration pass before hydration**: for each persisted product-entity query record, map rows through `migrateCachedEntity()` (entity registry, includes stx key rewrite); rewrite `contextQueries` similarly where they contain product entities; rewrite `meta.mutations` variables via `migrateQueuedMutation()`.
  4. Write everything + advanced `buster` in **one Dexie transaction per chunk** (chunk by entity type / N records) with the pointer advanced only in the final chunk's transaction → crash-resume re-runs idempotently (migrations are idempotent by construction: rename of an already-renamed field is a no-op).
  5. If `pointer > currentSchemaVersion` (rollback deploy): run backward migrations if a path exists, else wipe scope (rare; rollbacks within an expand window are no-ops anyway).
- **Session scopes** (`s-<uuid>`): wiped on pointer mismatch instead of migrated (they're allowed to be cold; avoids migrating dozens of orphaned scopes).
- **Leader gating**: the pass runs only in the tab holding the Web Lock leadership ([frontend/src/query/realtime/tab-coordinator.tsx](../frontend/src/query/realtime/tab-coordinator.tsx)); followers wait for a `cache-migrated` broadcast before restoring. See 1.7.
- No network involved: 300–1000 clients migrating costs the server nothing.

### 1.5 Queued mutation replay safety

Seam: `resumePausedMutations()` runs after `waitForActiveCatchup()` in [frontend/src/query/provider.tsx](../frontend/src/query/provider.tsx).

- Mutations were already rewritten on disk by 1.4 in the same transaction as the pointer — they replay in current shape with consistent `stx.fieldTimestamps`.
- In-memory pending mutations during a **live PWA update** (SW swap without full reload): handled by 1.7's forced reload policy — the new bundle restores rewritten mutations from disk.
- Squashing (`squashPendingMutation` / `coalescePendingCreate` in [frontend/src/query/offline/squash-utils.ts](../frontend/src/query/offline/squash-utils.ts)) operates post-migration, so field keys always match — no cross-version squash bugs.

### 1.6 Tolerant reader (backstop, not primary)

- After restore, rows are expected to be current-shape. A thin guard in `restoreClient()` runs `identifyAndMigrate()` (doba `identify` with field-presence guards + `tryParse` against derived version schemas) **only when** a marker indicates an interrupted migration, or per-row when a downstream Zod parse fails.
- Row that fails even identify → evict that single query record (refetch on demand). Never fleet-wide.
- Scope: product entity queries only, and only during a rollover window (pointer ≠ current at boot). No steady-state Zod parsing of the whole cache — that would be the real perf hazard.

### 1.7 Multi-tab + PWA update coordination

The unsolved race in the old plan: an old-bundle tab can persist old-shape rows after a new-bundle tab migrates.

- **Pointer-mismatch broadcast**: on boot, the new bundle broadcasts `schema-version: N` on the existing BroadcastChannel. Tabs running an older bundle (their `currentSchemaVersion < N`):
  - immediately stop persisting (flip `shouldDehydrateQuery`/`shouldDehydrateMutation` to false),
  - show the existing PWA refresh prompt; **force-reload when idle** (reuse the "safe to interrupt" gate from the apiVersion backstop — never mid-task).
- **Leader-gated migration** (1.4) + followers blocked on `cache-migrated` ensures no tab restores mid-rewrite.
- **Persist guard**: persister refuses to write when its bundle's `currentSchemaVersion < buster` on disk (a stale tab can never downgrade the store).
- **Staleness deadline**: bundle older than N days (config) must update before continuing — idle-gated, jittered. PWA update detection wiring (vite-plugin-pwa `registerSW` events) is added as part of this step; today [frontend/src/lib/sw.ts](../frontend/src/lib/sw.ts) has no update handling.

### 1.8 CI guards

1. **Append-only lint**: script fails if any committed file under `version-changes/` (except `index.ts`) differs from its first-commit blob (`git log --follow` check). Runs in `pnpm check`.
2. **oasdiff gate**: wire [oasdiff](https://github.com/oasdiff/oasdiff) into the [generate-openapi.ts](../backend/scripts/generate-openapi.ts) / `openapi.manifest.json` flow. Breaking verdict ⇒ PR must add a lens module or bump `apiVersion`; additive ⇒ pass.
3. **Config-collision validator** (build-time test in `shared`): every lens `delta` field name checked against:
   - CDC counter logic field reads (`role`, `rejectedAt` in [cdc/src/utils/update-counts.ts](../cdc/src/utils/update-counts.ts)),
   - `appConfig.entityEmbeddings[].hostColumn`,
   - `propagationTargets` field names,
   - the **frozen envelope** list (D4) — lensing those is a hard error pointing at the apiVersion backstop.
4. **Lens purity lint**: no `await`, no value-dependent logic beyond declared `custom` converters, no dynamic key access from input data.

### 1.9 Telemetry + failure capture

- doba hooks: `onTransform`/`onStep` → otel histograms (`lens.transform.duration`, per lens id); `ctx.defaulted`/`warnings` → counters. Server-side registry created with these hooks; client-side registry without (or dev-only `debug: true`).
- `X-Client-Version` distribution → fleet-floor dashboard: contract phase allowed only when floor > the expand lens's ordinal for a config-defined window.
- **Client `failed_sync` Dexie table**: any mutation that fails replay with a 4xx after up-migration is quarantined (never dropped), surfaced in a non-blocking banner with JSON export. (Server-side DLQ table moves to Phase 2 — observability for the fork mesh; internal clients are covered by the client table + version telemetry.)

### Phase 1 testing strategy

- **Lens unit tests**: per-delta-kind derivation tests + round-trip property tests (already in 1.1).
- **Integration (backend)**: replay a recorded old-version update request against a server with one lens applied → assert upgraded write, correct LWW vs a concurrent new-shape edit, `droppedFields` named in old shape.
- **Integration (frontend, Vitest + fake-indexeddb)**: seed Dexie with old-shape records + queued mutations, boot persister with a lens registry one ahead → assert rewritten rows, advanced pointer, mutations replay in new shape; crash-resume test (kill between chunks, reboot, assert idempotent completion).
- **E2E (offline runbook)**: extend `pnpm offline` flow — build bundle A, populate cache + offline edits, swap to bundle B with a rename lens, reconnect, assert zero data loss and no refetch storm (network log).

---

## Phase 2 — fork mesh version tolerance

Builds on Phase 1's lens registry; adds negotiation between independently-deployed Cella forks whose entity models diverge.

### 2.1 Versioned OpenAPI spec artifact

- Extend [generate-openapi.ts](../backend/scripts/generate-openapi.ts): after producing the latest spec, replay lens `delta`s newest→oldest to emit each historical spec (`backend/openapi/{ordinal}.json`). Pure JSON-schema rewrites driven by the same `delta` kinds (rename/add/drop/retype) — the lens's fourth artifact.
- Expand-phase specs show both field names; contract-phase specs show only the new one.
- SDK generation ([sdk/openapi-ts.config.ts](../sdk/openapi-ts.config.ts)) stays single-spec (current version) — versioned specs are **for peers**, not for our own SDK.

### 2.2 Version discovery + negotiation

- `GET /versions` (unauthenticated, cacheable): `{ apiVersion, schemaVersion, lenses: [{ id, entityType, phase }], specs: '/openapi/{v}.json' }`.
- Peer requests carry `Accept-Version: <schemaVersion>` (and identify as peers via existing auth — service tokens / org-scoped credentials, reusing `checkPermission()` guards; **no new auth surface**).
- Server behavior = Phase 1 seams with `clientVersion := Accept-Version`: up-migrate peer requests, down-migrate responses. Same middleware, second consumer class.
- Unknown/too-old version (no path in the registry graph) → `426 Upgrade Required` with the `/versions` URL — explicit, never silent.

### 2.3 Cross-fork lens graphs (where doba pays off)

- A fork's registry = upstream cella lenses + fork-local lenses. Schema nodes get namespaced ids (`cella:v7`, `raak:v3`) and the graph **branches** — exactly doba's model (schemas are nodes, migrations are edges, Dijkstra with `deprecated`/`cost` edges picks routes).
- Shared-core contract: forks interoperate on the **upstream entity subset** (entities + fields defined in cella core). Fork-divergent fields are dropped with `ctx.defaulted` telemetry when crossing the boundary (lossy edge, costed higher).
- The `cella` sync CLI gains a check: fork-local lenses must not collide with upstream lens ids (date-prefix + fork namespace makes this mechanical).
- Peer-to-peer calls between forks at different upstream baselines route through the shared upstream chain: `raak@v3 → cella:v7 → cella:v5 → forkB@v2`. doba `findPath` + `explain()` give debuggable routing; `pathStrategy: 'direct'` available for pinned contracts.

### 2.4 Server `failed_mutations` DLQ

- Postgres table: `{ id, peerOrClientVersion, entityType, entityId, mutationId, body jsonb, issues jsonb, createdAt }`.
- Written when up-migration or validation fails for a versioned consumer (after lens path attempts). Never auto-replayed; idempotent manual replay via `stx.mutationId`.
- Primary value: observability — alertable signal that some consumer is broken + audit trail for repair.

### 2.5 Contract lifecycle automation

- Telemetry from 1.9 + 2.2 (header distributions) feeds a "safe to contract" check: contract lens PRs are CI-blocked unless the fleet floor (internal clients **and** registered peers) has passed the expand ordinal for the configured window.
- Sunset/Deprecation headers (RFC 8594/9745) emitted on responses served to consumers more than N lenses behind.

---

## Build order

| # | Item | Phase | Depends on |
|---|---|---|---|
| 1 | 1.0 version stamp (`X-Client-Version`, otel distribution) | 1 | — |
| 2 | 1.1 `version-changes/` + doba engine facade + tests | 1 | — |
| 3 | 1.2 request up-migration preset (+ Hono bodyCache pin test) | 1 | 1, 2 |
| 4 | 1.3 response down-migration | 1 | 1, 2 |
| 5 | 1.8 CI guards (append-only, config-collision, purity) | 1 | 2 |
| 6 | 1.4 cache pointer + boot migration pass | 1 | 2 |
| 7 | 1.7 multi-tab + PWA update coordination | 1 | 6 |
| 8 | 1.5 mutation replay + 1.6 tolerant reader | 1 | 6 |
| 9 | 1.9 telemetry + client `failed_sync` | 1 | 3, 6 |
| 10 | oasdiff gate (1.8.2) | 1 | 2 |
| 11 | 2.1 versioned specs | 2 | 2 |
| 12 | 2.2 `/versions` + `Accept-Version` | 2 | 3, 4, 11 |
| 13 | 2.3 cross-fork graphs + CLI checks | 2 | 12 |
| 14 | 2.4 server DLQ | 2 | 12 |
| 15 | 2.5 contract automation | 2 | 9, 12 |

Items 1–5 ship value alone (server-side tolerance covers the PWA-skew window even before client cache migration exists). The `apiVersion` backstop (session-cookie name bump, idle-gated re-auth, jitter/pre-warm) remains as designed in the superseded research doc and is unchanged by doba.

---

## Known challenges (flagged for discussion)

1. **Hono `bodyCache` overwrite** (1.2) is internal-API territory — pinned by a dedicated test, but a `@hono/zod-openapi` major could force rework. Alternative if it breaks: reconstruct the `Request` with the upgraded body (heavier, public API).
2. **doba maturity**: v0.1.0, single maintainer. Mitigated by facade + pin + vendoring path, but worth a periodic health check; if we hit a bug, contributing upstream is cheaper than forking.
3. **Two-registry derivation complexity** (entity + ops from one delta) is our code, not doba's — the derivation in `engine.ts` is the highest-correctness-risk module and gets the densest property tests.
4. **`retype` deltas** (e.g., `string → number`) need `custom` converters and may be genuinely lossy backward; policy decision per lens (`lossyBackward` + telemetry) rather than a general solution.
5. **Yjs-edited description fields** are outside the lens system (CRDT binary, separate worker); renaming a description-derived field touches the Yjs derived-fields PATCH contract — treat as frozen-envelope-adjacent until needed.
6. **Expand-phase dual writes** produce dual deltas in CDC `changedFields` and slightly larger SSE payloads — accepted noise, documented.
