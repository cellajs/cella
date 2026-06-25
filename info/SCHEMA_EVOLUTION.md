# Schema evolution implementation plan (doba lenses)

> **Status**: Implementation plan. Supersedes [RESEARCH_CACHE_BUSTING_clean.md](./RESEARCH_CACHE_BUSTING_clean.md).
> Mechanism: version-tolerant API boundary + local cache migration, built on [doba](https://github.com/karol-broda/doba) (`dobajs`) as the transform/registry engine.
> Related: [SYNC_ENGINE.md](./SYNC_ENGINE.md), [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## TL;DR

Breaking schema changes (e.g., rename `task.name` → `task.title`) are shipped as **append-only lens modules**. Each lens declares the change once; everything else is derived from that declaration:

1. **Widened wire schemas** (build time) — during the expand window, ops/create schemas accept both old and new field names; entity rows carry both columns so responses dual-emit both
2. **Ops normalization** (server, runtime touch point 1) — old-shape `ops` + `stx.fieldTimestamps` keys normalized to canonical inside the existing stx resolve path
3. **Client cache migration** (client, runtime touch point 2) — boot-time Dexie pass rewrites cached rows + queued mutations locally, no refetch
4. **Versioned OpenAPI specs + response down-migration** (Phase 2 only) — for fork mesh negotiation

**Phase 1 has exactly two runtime transformation touch points.** Everything else is build-time schema generation, data-level dual-emit during expand windows, or deferred to Phase 2.

doba provides the migration chain executor, bidirectional migrations, graph path-finding (Phase 2), and telemetry hooks. We provide the lens module convention, the Cella seams, and the OpenAPI artifact.

**Two phases:**
- **Phase 1 — Internal version tolerance**: app's own offline clients survive deploys (PWA skew, mid-exam, offline queue replay)
- **Phase 2 — Fork mesh**: independently-deployed Cella forks interoperate via version negotiation

---

## Where transformations happen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           Phase 1 — two runtime touch points (▣), rest is build time         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BUILD TIME                                                                  │
│  ┌──────────────────────────┐  derives  ┌─────────────────────────────────┐ │
│  │ shared/version-changes/  │ ────────> │ widened ops/create Zod schemas  │ │
│  │ lens modules (frozen,    │           │ key maps (ops + fieldTimestamps)│ │
│  │ append-only)             │           │ cache-row migrations (doba)     │ │
│  │ delta: name → title      │           │ versioned specs (Phase 2)       │ │
│  └──────────────────────────┘           └─────────────────────────────────┘ │
│                                                                              │
│  WRITE PATH (server)                                                         │
│                                                                              │
│   old bundle ──ops:{name}──┐                                                 │
│                            ├──> Zod validation ──> ▣ normalizeOps()          │
│   new bundle ──ops:{title}─┘    (widened schema     key map: name→title      │
│                                  accepts both)      + stx timestamp keys     │
│                                                     + mirror-write twin col  │
│                                            │                                 │
│                                            ▼                                 │
│                                  HLC/AWSet merge ──> DB                      │
│                                  (canonical keys     (canonical + mirrored   │
│                                   only)               old column)            │
│                                                                              │
│  READ PATH (server) — no transform                                           │
│                                                                              │
│   DB row {name,title} ──> handler/enrichment ──> TTL cache ──> response      │
│                           dual-emits both fields during expand window:       │
│                           old bundle reads `name`, new bundle reads `title`  │
│                                                                              │
│  CLIENT BOOT                                                                 │
│                                                                              │
│   Dexie restore ──> buster < current? ──> ▣ boot migration pass              │
│   (per-query rows,                          lens chain over cached rows +    │
│    meta.mutations)                          queued mutation ops/stx keys     │
│                                             (chunked txns, leader-gated)     │
│                                            │                                 │
│                                            ▼                                 │
│                                   hydrate React Query ──> UI                 │
│                                                                              │
│  UNTOUCHED: CDC worker · SSE notifications · catchup summaries · seq/counters│
│  TTL entity cache · activitiesTable (operate on IDs/seqs or canonical shape) │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           Phase 2 — fork mesh adds per-version edge transforms (▣)           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Fork B (schemaVersion 5)                This fork (schemaVersion 9)        │
│                                                                              │
│   ops:{name} ── Accept-Version: 5 ──>  ▣ upgrade via doba path               │
│                                          (v5 → v7 → current)                 │
│                                            │                                 │
│                                            ▼                                 │
│                                          normalizeOps ──> handler ──> DB     │
│                                                                              │
│   reads name <── response ──────────── ▣ downgradeEntity(entity, v5)         │
│                                          post-TTL-cache; lossyBackward       │
│                                          fields omitted                      │
│                                                                              │
│   GET /versions ──> { schemaVersion, lenses, /openapi/{v}.json }             │
│   no path in lens graph ──> 426 Upgrade Required                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Touch point reduction (vs. earlier draft)

| Earlier draft | Now | Why it's safe |
|---|---|---|
| Pre-validation middleware + Hono `bodyCache` overwrite | **Cut** | Widened expand-window schema makes old shapes *valid*; normalization moves after validation into `resolveUpdateOps` — code the sync engine already owns. No Hono internals. |
| Per-request response down-migration (Phase 1) | **Deferred to Phase 2** | Expand-window rows dual-emit both fields — old bundles read old names with zero per-request work; contract is gated on fleet floor + staleness deadline |
| `X-Client-Version` as correctness input | **Telemetry-only in Phase 1** | No Phase 1 transform decision depends on it; it gates contract timing only |
| SSE `?cv=` version param | **Cut** | Notifications are frozen envelope — they carry no entity fields |
| Two doba registries per entity (`entity` + `ops`) | **One registry + derived key map** | Ops transforms for rename/add/drop are pure key renames; a `Record<old, new>` suffices |
| Tolerant reader with doba `identify`/`tryParse` | **Cut** | Migrations are idempotent — re-run the chain on suspicion; evict single records on Zod failure |

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
| Tolerant reader | `identify` guard map + `tryParse` fallback, `identifyAndTransform()` (not used in Phase 1 — see 1.6) | `registry.ts#L837-L926` |
| Telemetry | `hooks.onTransform/onStep/onWarning`, `ctx.warn`/`ctx.defaulted` → `result.meta.warnings/defaults` | `context.ts` |
| Error handling | Errors as values (`Result<T, DobaIssue[]>`), migrations that throw → `transform_failed` issue | `result.ts`, `transformCore` catch |
| Packaging quality | publint + arethetypeswrong in `prepublishOnly`, `files: [dist]` | package.json |

**Risk management for the dependency:**
- Pin exact version in `pnpm-workspace.yaml` catalog; review diffs on every bump.
- MIT, zero deps, ~10 source files → **vendoring into `shared/` is the documented escape hatch** if the project stalls.
- Write our integration behind a thin facade (`shared/src/version-changes/engine.ts`) so doba is swappable: only the facade imports `dobajs`.

**What doba does NOT provide (we build):**
- Lens module convention (frozen, append-only, date-ordered files)
- Key-map derivation for `ops` + `stx.fieldTimestamps` (see D1)
- OpenAPI spec replay artifact
- Cache pointer + Dexie migration pass
- CI guards (append-only lint, oasdiff, config-collision validator)

**Note on Phase 1 footprint:** Phase 1 exercises doba only as a linear chain executor for cache-row migration; its graph/path-finding payoff lands in Phase 2. This keeps the dependency trivially replaceable while Phase 1 hardens in production.

---

## Architecture decisions

### D1: One entity registry per type; ops handled by derived key maps

A product entity has two wire shapes (`entity` full row; `ops` partial update with AWSet deltas), but they do **not** need separate transform machinery. For every delta kind except `retype`, the ops-side transform is a pure key rename — identical to the entity-side key change. So:

- **One doba registry per entity type** (entity shape; nodes `v0`, `v3`, ... `current`) — used by the client cache migration and Phase 2 `downgradeEntity`
- **One derived key map per lens** (`Record<oldKey, newKey>`) applied to `ops` objects, `stx.fieldTimestamps`, and queued mutation variables — a ~10-line helper, no registry needed
- Only `retype` deltas (rare) declare a custom ops converter in the lens

```ts
// shared/src/version-changes/engine.ts (facade — only file that imports dobajs)
const entityRegistries: Record<ProductEntityType, Registry<...>>; // doba: cached rows, peer downgrade
const keyMaps: Record<ProductEntityType, Record<string, string>>; // ops + stx timestamp keys
```

### D2: Global schema version = lens count; per-entity nodes derived

- `currentSchemaVersion = lenses.length` (global ordinal, monotonic, baked into both bundles from `shared`).
- Per entity type, version **nodes** exist only where that entity changed: task lenses at global ordinals 3 and 7 → task nodes `v0` (pre-3), `v3`, `v7` (= current). A consumer at global version 5 maps to task node `v3` (latest task node ≤ 5). This keeps chains short and avoids no-op hops.
- Within the app, chains are linear → BFS. Fork mesh (Phase 2) adds branches → Dijkstra with `deprecated`/`cost` edges. Both are doba built-ins; nothing changes in our code.

### D3: Phase 1 needs no version negotiation for correctness

- **Server writes**: the widened expand-window schema makes old-shape ops *valid*; normalization is presence-based (`'name' in ops` → map to `title`) and unambiguous within an expand window. No header consulted.
- **Cache rows**: version comes from the persisted **cache pointer** (`buster` slot), never from inspecting rows.
- `X-Client-Version` is still sent from day one, but in Phase 1 it is **telemetry-only** (fleet floor for contract gating). It becomes a correctness input only in Phase 2, where `Accept-Version` drives response down-migration for arbitrarily-old peers.

### D4: Canonical shape inside; dual-emit at the edge during expand

- DB business logic, CDC, activitiesTable, TTL entity cache, SSE notifications: **newest shape only** (plus the mirrored old column during an expand window).
- Responses need **no per-request transform in Phase 1**: during expand, the row contains both columns (Drizzle backfill + mirror writes), so responses dual-emit both field names with zero work. Per-version `downgradeEntity` exists only in Phase 2 for peers, applied *after* TTL cache read (canonical cache, no per-version fragmentation).
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

  // Optional escape hatch when delta alone can't express the change
  // (retype, splits/merges). Pure functions; receive doba ctx for
  // ctx.defaulted/ctx.warn telemetry. Rename/add/drop never need this.
  custom?: { entityForward?, entityBackward?, opsConvert? },

  // Security flag: backward direction re-exposes removed data → forbid.
  lossyBackward?: boolean, // if true, Phase 2 downgradeEntity omits instead of restoring
});
```

Supported `delta` kinds (each with deterministic forward/backward/spec/timestamp derivations): `rename`, `add` (with default for backward-compat fill), `drop`, `retype` (requires `custom` converters), `setRename` (rename of an AWSet field).

The derived `fieldTimestamps` key map is applied wherever stx travels: server-side `normalizeOps` (incoming `stx.fieldTimestamps`), cache migration (stored entity `stx`), and queued mutation rewrite. **This closes the LWW-skew gap**: without it, a renamed scalar would lose its HLC history and an older offline edit could win.

---

## Phase 1 — internal version tolerance

### 1.0 Version telemetry header

Phase 1 correctness does not depend on knowing the client version (D3) — but contract gating does. Ship the cheap part from day one:

- Add `currentSchemaVersion` export to `shared/src/version-changes/index.ts`; baked into each bundle at build time.
- **Frontend**: set `X-Client-Version` header in the fetch wrapper in [frontend/src/lib/api-client.ts](../frontend/src/lib/api-client.ts) (`createClientConfig`) — one place, covers the whole generated SDK. No SSE changes (notifications carry no entity fields).
- **Backend**: read the header into an otel counter keyed by version. No `ctx.var`, no middleware logic beyond the counter.
- The version distribution is the fleet floor for "safe to contract" (1.9). Phase 2 upgrades the same header pattern into a correctness input for peers.

### 1.1 Lens package + doba registries

- Add `dobajs` to the `shared` package (pinned exact). `shared` is already consumed by backend, frontend, and cdc — single source of truth, ships atomically with each bundle.
- Implement `define.ts`, `engine.ts` (delta → entity registry migrations + key maps + widened schemas + reverse schema derivation), `index.ts` ordered list.
- `engine.ts` exposes the only API the rest of the codebase uses:

```ts
normalizeOps(entityType, ops, stx): { ops, stx }             // key maps + mirror writes (server seam)
migrateCachedEntity(entityType, entity, fromVersion): entity // doba chain → current (incl. stx keys)
migrateQueuedMutation(entityType, variables, fromVersion): variables // key maps
widenedOpsSchema(entityType): ZodRawShape                    // expand-window schema aliases
downgradeEntity(entityType, entity, toVersion): entity       // Phase 2 only (peers)
currentSchemaVersion: number
versionNodeFor(entityType, globalVersion): string            // D2 mapping
```

- All calls use `validate: 'none'` (zod-openapi / Dexie context validate elsewhere); `from === to` short-circuits in doba make the steady-state cost ~zero.
- Unit tests: round-trip property tests per lens (forward∘backward = identity modulo declared loss), timestamp-map consistency, derived-schema equality vs hand-written expectation.

### 1.2 Widened schemas + ops normalization (backend, single seam)

No middleware, no body re-parsing, no Hono internals. Two derived pieces:

1. **Widened wire schemas (build time)** — while a lens is in its expand window, the generated ops/create Zod schemas accept **both** field names (old optional alias generated from `delta`, not hand-edited in module schemas). Old-shape requests pass OpenAPIHono validation unchanged — including curl/tests that send no version header.
2. **Normalization at the existing stx seam (runtime)** — `resolveUpdateOps` ([backend/src/core/stx/resolve-update.ts](../backend/src/core/stx/resolve-update.ts)) and the create operation helper call `normalizeOps(entityType, ops, stx)` first thing:
   - apply lens key maps to `ops` and `stx.fieldTimestamps` (old → canonical),
   - during expand, **mirror-write** the twin column (new client sends `title` → also writes `name`; old client sends `name` → also writes `title`) so every reader sees fresh data in whichever field its bundle knows,
   - run `custom.opsConvert` for `retype` lenses.

HLC/LWW resolution and AWSet application then operate on canonical keys only. This is the **only server-side runtime touch point**, and it sits in code the sync engine already owns.

### 1.3 Read path: dual-emit instead of response transforms

Phase 1 deliberately has **no response-side transform**:

- During expand, the entity row carries both columns (Drizzle migration adds + backfills the new column; 1.2 mirror writes keep both fresh). Responses, TTL-cache entries, and seq-cursor delta fetches all dual-emit both field names with zero per-request work.
- `droppedFields` after LWW lists canonical names plus the old alias (derived from the same key map) so old bundles can match it.
- **Contract is the enforcement point**: the old column/field is removed only when the `X-Client-Version` fleet floor has passed the expand ordinal for a configured window AND the staleness deadline (1.7) has expired old bundles. CI blocks contract-phase lens PRs otherwise (1.9).
- SSE notifications and catchup summaries are untouched either way (frozen envelope — IDs and seqs only).
- Tradeoff (accepted): expand windows live for days-to-weeks; old+new columns coexist in DB and payloads. Standard parallel-change practice — costs bytes, not transforms.
- Per-version `downgradeEntity` (a true response transform) arrives only in Phase 2, where peers can be arbitrarily many versions behind.

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

### 1.6 Backstop: idempotent re-run + evict-on-fail (no identify layer)

Because every lens migration is idempotent by construction (rename of an already-renamed field is a no-op), the backstop is trivial:

- If boot detects an interrupted pass (pointer behind, marker present), **re-run the whole chain** over the affected scope — idempotency makes mixed old/new rows safe.
- Any row that still fails a downstream Zod parse → evict that single query record (refetch on demand). Never fleet-wide.
- No doba `identify()`, no `tryParse`, no steady-state Zod parsing of the cache. (Identify-based shape detection is reconsidered only if Phase 2 peer payload auditing needs it.)

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
- **Client `failed_sync` Dexie table**: any migrated mutation that still fails replay with a 4xx is quarantined (never dropped), surfaced in a non-blocking banner with JSON export. (Server-side DLQ table moves to Phase 2 — observability for the fork mesh; internal clients are covered by the client table + version telemetry.)

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
- Server behavior: peer requests flow through the same 1.2 seam (key maps cover the live expand window; older peers get an explicit doba chain upgrade before `normalizeOps`). Responses gain the **first true response transform**: `downgradeEntity(entity, peerVersion)` applied post-TTL-cache on product-entity routes when `Accept-Version < currentSchemaVersion`. `lossyBackward` lenses omit rather than restore removed fields (security: a field dropped for exposure reasons must not reappear for old peers).
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
| 1 | 1.1 `version-changes/` + doba engine facade + tests | 1 | — |
| 2 | 1.2 widened schemas + `normalizeOps` at stx seam | 1 | 1 |
| 3 | 1.0 `X-Client-Version` telemetry header | 1 | 1 |
| 4 | 1.8 CI guards (append-only, config-collision, purity) | 1 | 1 |
| 5 | 1.3 contract-gating policy (fleet floor check) | 1 | 3 |
| 6 | 1.4 cache pointer + boot migration pass | 1 | 1 |
| 7 | 1.7 multi-tab + PWA update coordination | 1 | 6 |
| 8 | 1.5 mutation replay + 1.6 idempotent backstop | 1 | 6 |
| 9 | 1.9 telemetry + client `failed_sync` | 1 | 3, 6 |
| 10 | oasdiff gate (1.8.2) | 1 | 1 |
| 11 | 2.1 versioned specs | 2 | 1 |
| 12 | 2.2 `/versions` + `Accept-Version` + `downgradeEntity` | 2 | 11 |
| 13 | 2.3 cross-fork graphs + CLI checks | 2 | 12 |
| 14 | 2.4 server DLQ | 2 | 12 |
| 15 | 2.5 contract automation | 2 | 9, 12 |

Items 1–5 ship value alone (expand-window tolerance covers the PWA-skew window even before client cache migration exists). The `apiVersion` backstop (session-cookie name bump, idle-gated re-auth, jitter/pre-warm) remains as designed in the superseded research doc and is unchanged by doba.

---

## Known challenges (flagged for discussion)

1. **Expand windows are long-lived state** — old+new columns coexist for days-to-weeks, and overlapping expand windows for the same entity must compose (key-map chains are order-sensitive). Covered by chain property tests; worth a "max concurrent expand lenses per entity" lint.
2. **doba maturity**: v0.1.0, single maintainer. Mitigated by facade + pin + vendoring path, but worth a periodic health check; if we hit a bug, contributing upstream is cheaper than forking. Phase 1 exercises it only as a chain executor, so the blast radius is small.
3. **Derivation in `engine.ts`** (delta → schema widening, key maps, doba migrations, spec deltas) is our code, not doba's — still the highest-correctness-risk module and gets the densest property tests, though materially smaller than the earlier two-registry design.
4. **`retype` deltas** (e.g., `string → number`) need `custom` converters and may be genuinely lossy backward; policy decision per lens (`lossyBackward` + telemetry) rather than a general solution.
5. **Yjs-edited description fields** are outside the lens system (CRDT binary, separate worker); renaming a description-derived field touches the Yjs derived-fields PATCH contract — treat as frozen-envelope-adjacent until needed.
6. **Expand-phase mirror writes** produce dual deltas in CDC `changedFields` and slightly larger payloads during the window — accepted noise, documented.

---

## Prior art and references

The lens approach here is not novel — it composes well-established ideas. Useful background for anyone extending the system:

### The lens model (closest prior art)
- **Project Cambria — "Translate your data with lenses"** (Ink & Switch). Bidirectional lenses for evolving document schemas in local-first apps, with forward/backward transforms and graph-based version resolution. `doba` is effectively a typed, modern take on this model. <https://www.inkandswitch.com/cambria/> · code: <https://github.com/inkandswitch/cambria>
- **Local-first software** (Ink & Switch) — motivates offline-tolerant schema migration and sync. <https://www.inkandswitch.com/local-first/>
- **`doba` / `dobajs`** — the transform/registry engine this plan builds on. <https://github.com/karol-broda/doba>

### Bidirectional transformations (the theory under "lenses")
- **Boomerang / lenses** — Foster, Greenwald, Moore, Pierce & Schmitt, *"Combinators for Bidirectional Tree Transformations: A Linguistic Approach to the View-Update Problem."* Origin of the well-behaved `get`/`put` lens laws our `forward`/`backward` pairs approximate.

### Expand/contract rollout (our `phase: 'expand' | 'contract'`)
- **Martin Fowler — ParallelChange (expand–contract).** <https://martinfowler.com/bliki/ParallelChange.html>
- **Refactoring Databases** (Ambler & Sadalage) — catalog of safe, staged schema migrations the `delta` kinds mirror.
- **Evolutionary Database Design.** <https://martinfowler.com/articles/evodb.html>

### Adjacent / corroborating
- **CRDT data migration** — Automerge docs and the Ink & Switch CRDT work; rationale for our lens also rewriting `stx.fieldTimestamps` (HLC) keys, not just field names.
- **Per-consumer API versioning** — Stripe's API-upgrade write-ups describe response down-migration keyed on consumer version, the shape of our Phase 2 `downgradeEntity` + `Accept-Version`.

