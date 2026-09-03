# Schema evolution

This document explains how breaking changes to entity wire shapes ship without stranding offline clients.

### TL;DR

When the fields returned by the API change incompatibly, add one permanent conversion module that
describes the old and new forms. These modules are called **lenses**. From that description, Cella
accepts both forms during rollout, converts writes to the current form, and updates data already
cached in browsers. No lenses have shipped yet, so the system currently leaves data unchanged.
Until the first real lens is added, use the interim [cache reset](#cache-bust-interim).

---

## The lens model

A breaking schema change (rename `attachment.name` to `attachment.title`, say) ships as an **append-only lens module**. The lens declares the change once; everything else derives from it:

1. **Widened wire schemas** (build time): during the expand window, ops/create schemas accept both field names, and rows carry both columns so responses dual-emit both.
2. **Ops normalization** (server, runtime touch point 1): old-shape `ops` and `stx.fieldTimestamps` keys map to canonical inside the existing stx resolve path.
3. **Client cache migration** (client, runtime touch point 2): a boot-time Dexie pass rewrites cached rows and queued mutations locally, without refetch.
4. **Versioned OpenAPI specs + response down-migration** (Phase 2 only): cross-app negotiation.

Phase 1 has exactly two runtime touch points; the rest is build-time schema generation or dual-emit during expand windows.

- **Phase 1 (internal version tolerance)**: the app's own offline clients survive deploys (PWA skew, offline queue replay). Built; passthrough until lens #1.
- **Phase 2 (cross-app negotiation)**: independently deployed Cella apps interoperate via version negotiation. Not started.

---

## Cache-bust (interim)

Until the first lens ships, breaking schema changes use a throwaway escape hatch:

1. **`appConfig.clientCacheVersion`** ([shared/config/config.default.ts](../shared/config/config.default.ts)): a string token next to `apiVersion`/`cookieVersion`. Bump it (`'v1'` to `'v2'`) in the **same PR** as any breaking change to a cached entity's wire shape.
2. **Client wipe, mutations preserved**: on boot, [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) compares the persisted version to `appConfig.clientCacheVersion`; on mismatch it wipes cached query data (product records + bundled channel queries) but **keeps queued mutations**, which replay against the fresh cache. A missing version (pre-feature build) seeds without wiping. Session scopes are wiped wholesale.
3. **Mutation salvage**: replayed mutations that 4xx are quarantined to the `failed_sync` Dexie table ([frontend/src/query/offline/failed-sync.ts](../frontend/src/query/offline/failed-sync.ts)), never dropped (non-blocking banner, JSON export).
4. **CI gate**: `schema-bust-gate` in [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs oasdiff on the committed `backend/openapi.cache.json` (base vs head). A breaking diff **fails the PR** unless `clientCacheVersion` was bumped in the same PR. Pair it with a `feat!` PR title so release-please cuts a major. The gate is PR-time only and never blocks release/deploy jobs.

**Teardown**: once lenses are stable, delete `appConfig.clientCacheVersion`, the persister bust branch, the `failed_sync` quarantine, and the `schema-bust-gate` job; the lens engine is independent of all four.

The `apiVersion` backstop (session-cookie name bump, idle-gated re-auth, jitter/pre-warm) versions the protocol, not entity resources ([Tier 3](#entity-coverage)), and is unchanged by lenses.

---

## Lens playbook

Not yet written; required before lens #1. Must cover:

- **Expand PR**: the lens module, the Drizzle expand-migration convention (add and backfill the new column, keep the old), the mirror-write window start, and the `feat!` title / `schema-bust-gate` interplay.
- **Verification**: the offline e2e runbook (`pnpm offline`: bundle A populates the cache and makes offline edits, swap to bundle B with the lens, reconnect, assert zero data loss and no refetch storm).
- **Contract PR**: fleet-floor check against `X-Client-Version` telemetry, column drop, the unbuilt `contractedLenses` bookkeeping.
- **Branch-local rehearsal**: a throwaway lens in a temporary lens-list entry that is never merged (`lens:check` append-only rules apply from the first commit on main only). Never ship a rehearsal lens: modules are append-only, so a rehearsal rename pollutes the API forever.

Expect `add` to dominate ([NoSQL study](https://arxiv.org/pdf/2003.00054)): add-with-default > drop > rename ≈ retype > enum renames > restructuring.

---

## Transformation points

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           Phase 1 - two runtime touch points (▣), rest is build time         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BUILD TIME                                                                  │
│  ┌──────────────────────────┐  derives  ┌─────────────────────────────────┐ │
│  │ shared/schema-evolution/  │ ────────> │ widened ops/create Zod schemas  │ │
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
│  READ PATH (server) - no transform                                           │
│                                                                              │
│   DB row {name,title} ──> handler/enrichment ──> TTL cache ──> response      │
│                           dual-emits both fields during expand window:       │
│                           old bundle reads `name`, new bundle reads `title`  │
│                                                                              │
│  CLIENT BOOT                                                                 │
│                                                                              │
│   Dexie restore ──> pointer < current? ──> ▣ boot migration pass             │
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

---

## Why doba

[dobajs](https://github.com/karol-broda/doba) (pinned exact at `0.1.0` in [shared/package.json](../shared/package.json)) supplies bidirectional migrations, lens-graph path-finding for Phase 2, Standard Schema v1 Zod compatibility, zero runtime deps, a `validate: 'none'` hot path, telemetry hooks, and errors as values. Only the facade [shared/src/schema-evolution/engine.ts](../shared/src/schema-evolution/engine.ts) imports it, so it stays swappable; vendoring into `shared/` is the escape hatch. Lens module convention, key-map derivation, spec replay, cache pointer, and CI guards are ours.

---

## Architecture decisions

| Decision | Rule | Consequence |
| --- | --- | --- |
| **D1** One registry per entity type; ops via key maps | One doba registry per entity type (nodes `v0`, `v3`, ... `current`) plus one derived key map per lens (`Record<oldKey, newKey>`) applied to `ops`, `stx.fieldTimestamps`, and queued mutation variables. Only `retype` deltas declare a custom ops converter. | No separate ops transform machinery; `entityRegistries` and `keyMaps` in engine.ts are the whole runtime surface. |
| **D2** Global schema version = lens count | `currentSchemaVersion = lenses.length`, baked into both bundles from `shared`. Per entity type, nodes exist only where that entity changed; a global version maps to the latest node at or below it (`versionNodeFor`). | Short linear chains (BFS); Phase 2 branches use doba's Dijkstra with `deprecated`/`cost` edges, no code change. |
| **D3** No version negotiation in Phase 1 | Server normalization is presence-based (`'name' in ops` maps to `title`); no header consulted. Cache version comes from the persisted `schemaVersion` meta pointer, never from inspecting rows; the RQ `buster` slot must stay `''`. `X-Client-Version` is telemetry-only (fleet floor). | Old-shape requests without a version header (curl, tests) stay valid. `Accept-Version` becomes a correctness input only in Phase 2. |
| **D4** Canonical inside; dual-emit at the edge | DB logic, CDC, activitiesTable, TTL entity cache, SSE: newest shape only (plus the mirrored old column during expand). The **frozen envelope** changes only via `apiVersion` bump: `stx`/`ops` wire structure, `StreamNotification`, `CatchupChangeSummary`, counter key formats (`sequence`, `e:f:{type}`/`e:f:h:{type}`, `e:c:{type}`/`e:c:h:{type}`), auth/session contract, SSE/WebSocket protocol. Enforced by the `lens:check` config-collision rule. | No per-request response transform in Phase 1; Phase 2 `downgradeEntity` runs after the TTL cache read. |
| **D5** Old schemas derived, not snapshotted | Older schema nodes are generated at startup by reverse-applying each lens delta to the current Zod schema (`.omit()`/`.extend()`). | The same replay powers the versioned OpenAPI artifact (Phase 2); derived schemas matter only for tests, `tryParse`, and spec generation. |

```ts
// shared/src/schema-evolution/engine.ts (facade: only file that imports dobajs)
const entityRegistries: Record<LensEntityType, Registry<...>>; // doba: cached rows, peer downgrade
const keyMaps: Record<LensEntityType, Record<string, string>>; // ops + stx timestamp keys
```

---

## Lens anatomy

```text
shared/src/schema-evolution/
  engine.ts                              # doba facade: builds registries from lenses
  define.ts                              # defineLens factory + types
  config.ts                              # schemaEvolutionPolicy knobs
  lens-list.ts                           # ordered registry (append-only, currently empty)
  2026-07-01-attachment-name-to-title.ts # frozen lens module (example)
```

```ts
// shared/src/schema-evolution/2026-07-01-attachment-name-to-title.ts
// FROZEN once shipped: CI fails on edits. Append-only.
import { defineLens } from './define';

export default defineLens({
  id: '2026-07-01-attachment-name-to-title',
  entityType: 'attachment',
  description: 'Rename attachment.name → attachment.title',
  phase: 'expand', // 'expand' | 'contract' - drives spec + wire widening

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

Supported `delta` kinds (each with deterministic forward/backward/spec/timestamp derivations): `rename`, `add` (with a default for backward-compat fill), `drop`, `retype` (requires `custom` converters; may lose data backward, so each such lens sets `lossyBackward`), `setRename` (rename of an AWSet field).

Module format rules:

- **`add` defaults may be functions** (`resolveAddDefault` in [define.ts](../shared/src/schema-evolution/define.ts)): a pure `(row) => value` covers fields derived from existing ones.
- **The module format is versioned** (`formatVersion` + `LENS_FORMAT_VERSION`, stamped and validated by `defineLens`), because modules are immortal.
- **`unknownFieldHandling`** (`ignore | strip | fail`, default `strip`, in `schemaEvolutionPolicy`): `normalizeOps` applies it to post-lens unmappable fields when callers pass `canonicalKeys`, and always reports them via `unknownFields`.
- **Non-goals**: no restructuring ops (`hoist`/`plunge`, `wrap`/`head`, `in`/`map`). Model rare restructures as `drop` + `add`-with-computed-default; one-to-many splits and cross-entity moves stay one-off scripts.

The derived `fieldTimestamps` key map is applied wherever stx travels: server-side `normalizeOps`, cache migration (stored entity `stx`), and queued mutation rewrite. Without it a renamed scalar would lose its HLC history and an older offline edit could win.

---

## Entity coverage

Both entity classes fall under a **three-tier contract**; the non-entity protocol surface stays versioned by `apiVersion`.

| Surface | Write path | Client cache | Lens coverage |
| --- | --- | --- | --- |
| **Product entities** (`attachment`) | stx ops + HLC/AWSet per-field merge via `resolveUpdateOps` | per-query Dexie records, seq/catchup, offline queue | **Tier 1, full**: all four artifacts |
| **Channel entities** (`organization`; `user` follows the same plain-REST pattern, add when first needed) | plain `PUT`, full-body partial (drizzle-zod); no ops, no stx, no HLC | bundled into the single Dexie meta record (`channelQueries`), no seq | **Tier 2, reduced derivation**: body-schema widening + `normalizeBody` + cache/mutation migration + dual-emit reads. No key maps, no `fieldTimestamps` rewriting, no mirror-write LWW logic: no per-field merge exists on this path. |
| **Non-entity surface** (auth/session, stx/ops envelope, SSE notifications, catchup summaries, counter formats) | frozen envelope (D4) | n/a | **Tier 3, excluded**: changes only via `apiVersion` |

Tier 2 matters in Phase 1 because channel mutations are queued offline too (`networkMode: 'offlineFirst'` is global; `shouldDehydrateMutation` persists any paused mutation), so an org rename queued under an old bundle must replay against a new server. Both classes share one lens ordinal, one telemetry chain, and the same CI guards.

Boundaries:

- **Membership** rides on channel entities via enrichment and has its own table and wire shape; treat its fields as frozen-envelope-adjacent until needed. Enrichment output (`membership`, `can`, `ancestorSlugs`) is computed, not stored, so cache migration never touches it.
- **Channel entities stay on plain PUT**: ops+stx would drag them into CDC/seq/catchup scope for no user-visible gain. The contract factory aligns the schema/tolerance layer, not the merge layer.
- **Full-API tolerance is rejected**: lensing the frozen envelope would mean transforming the sync protocol per consumer version (D4).
- **Yjs-edited description fields** are outside the lens system (CRDT binary, separate worker); treat them as frozen-envelope-adjacent.

---

## Evolution contract

Every wire body is an **entity body**, full (create) or partial (update), optionally with `stx`. An `ops` object is a partial entity body; a channel PUT body is the same without stx. Widening (old-name aliases) and normalization (canonical keys + expand mirror writes) are body-level; the only sync-specific extra is rewriting `stx.fieldTimestamps` keys, and the presence of `stx` is the discriminator.

Each entity module registers once through [backend/src/core/schema-evolution/evolution-contract.ts](../backend/src/core/schema-evolution/evolution-contract.ts), via one of two `evolutionContract` factories:

```ts
// Product (sync) entity: attachment-schema.ts
export const attachmentContract = evolutionContract.product("attachment", {
  createItem: attachmentCreateSchema, // module-assembled ZodObject (drizzle-zod picks, defaults, refines)
  updateOps: {
    // ops shape: scalar LWW + AWSet delta fields
    name: z.string().max(maxLength.field),
    // …
  },
});
// attachmentContract.createItemSchema  - createItem + stx, lens-widened; modules compose .array().min().max()
// attachmentContract.updateBodySchema  - { ops: partial(updateOps) widened, stx }, ≥1 op required
// attachmentContract.normalizeCreateItem(item)          - entity-bound runtime seam (create)
// attachmentContract.resolveUpdateOps(entity, ops, stx) - entity-bound runtime seam (update)
// attachmentContract.resolveServerUpdateOps(entity, ops) - trusted-server update seam

// Channel (plain) entity: organization-schema.ts
export const organizationContract = evolutionContract.channel("organization", {
  createItem: z.object({
    id: validTempIdSchema,
    name: validNameSchema,
    slug: validSlugSchema,
  }),
  updateBody: createInsertSchema(organizationsTable, {/* … */})
    .pick({/* … */})
    .partial(),
});
// organizationContract.createItemSchema / updateBodySchema - lens-widened
// organizationContract.normalizeBody(body)                 - entity-bound runtime seam
```

- **One widener**: `widenBodySchema(entityType, zodObject)` ([lens-seam.ts](../backend/src/core/schema-evolution/lens-seam.ts)) covers every derived schema: create bodies, product ops shapes ([update-schema.ts](../backend/src/core/schema-evolution/update-schema.ts)), channel partial bodies.
- **One runtime normalizer**: `normalizeBody(entityType, body)` (thin `normalizeOps` wrapper) for plain bodies; every create/update operation calls its contract-bound seam first.
- **`createItem` stays a module-assembled ZodObject** because create schemas carry picks, defaults, and batch refines a raw-shape union cannot express; the update shape is declared once in `updateOps`/`updateBody`.
- **Typed by construction**: the factories are generic over the raw shapes (`z.ZodObject<S>` parameters); a `ZodObject<ZodRawShape>` constraint would collapse inference to `Record<string, unknown>` and degrade the generated SDK.
- **Completeness is CI-enforced**: `lens:check` rule 4 asserts every `appConfig` product/channel entity type calls its contract factory in `backend/src/modules`.

Update semantics stay divergent: product updates merge per field (HLC/AWSet over `{ ops, stx }`); channel updates stay full-body-partial PUT with server-authoritative last write.

---

## Phase 1: how it works

### Version telemetry header

`currentSchemaVersion` (= lens count) is exported from [shared/src/schema-evolution](../shared/src/schema-evolution/index.ts) and baked into each bundle. The fetch wrapper in [frontend/src/lib/api-client.ts](../frontend/src/lib/api-client.ts) sets `X-Client-Version` on every SDK request (SSE is unchanged). On the backend, [client-version.ts](../backend/src/middlewares/client-version.ts) (mounted on all routes) feeds the `schema.client_version.seen` otel counter ([schema-version-metrics.ts](../backend/src/lib/schema-version-metrics.ts)), and [lens-telemetry.ts](../backend/src/lib/lens-telemetry.ts) wires doba's transform hooks into otel. Its distribution is the **fleet floor** for "safe to contract".

### Engine API

[engine.ts](../shared/src/schema-evolution/engine.ts) is the only API the codebase uses:

```ts
normalizeOps(entityType, ops, stx, options?): { ops, stx, unknownFields } // key maps + mirror writes (server seam)
migrateCachedEntity(entityType, entity, fromVersion): entity // doba chain → current (incl. stx keys)
migrateQueuedMutation(entityType, variables, fromVersion): variables // key maps
widenedOpsKeyMap(entityType): Record<string, string>         // expand-window alias map; call sites widen the Zod schemas
downgradeEntity(entityType, entity, toVersion): entity       // Phase 2 only (zero callers today)
currentSchemaVersion: number
versionNodeFor(entityType, globalVersion): string            // D2 mapping
configureLensTelemetry(hooks): void                          // host-provided doba hooks
```

All calls use `validate: 'none'` (zod-openapi and Dexie validate elsewhere). Policy knobs live in [config.ts](../shared/src/schema-evolution/config.ts): `expandWindowMinDays: 14`, `staleBundleMaxDays: 30`, `unknownFieldHandling: 'strip'`. `staleBundleMaxDays` has no consumer yet; the forced idle-gated reload is unbuilt.

### Server write path

No middleware, no body re-parsing. Two derived pieces, both reached through the [evolution contract](#evolution-contract):

1. **Widened wire schemas (build time)**: during a lens's expand window, the derived ops/create/body Zod schemas accept both field names (old optional alias generated from `delta`, never hand-edited), so old-shape requests pass OpenAPIHono validation unchanged.
2. **Normalization at the existing seam (runtime)**: `resolveUpdateOps` ([backend/src/core/stx/resolve-update.ts](../backend/src/core/stx/resolve-update.ts)) and the create/body seams call `normalizeOps` first. It applies lens key maps to `ops` and `stx.fieldTimestamps`, **mirror-writes** the twin column during expand (a `title` write also writes `name`, and vice versa), and runs `custom.opsConvert` for `retype` lenses. HLC/LWW resolution and AWSet application then see canonical keys only; this is the only server-side runtime touch point.

### Read path

Phase 1 has no response-side transform:

- During expand, the row carries both columns (the Drizzle migration adds and backfills the new column; mirror writes keep both fresh), so responses, TTL-cache entries, and seq-cursor delta fetches dual-emit both field names for free.
- **Contract is the enforcement point**: remove the old column/field only after the `X-Client-Version` fleet floor has passed the expand ordinal for `expandWindowMinDays`; until Phase 2 automates this, it is a manual contract-PR step.
- SSE notifications and catchup summaries are untouched (frozen envelope: IDs and seqs only).
- Accepted tradeoff: old and new columns coexist in DB and payloads for days to weeks; mirror writes produce dual deltas in CDC `changedFields`.

### Client cache migration

Seam: `migrateScopeToCurrent` in [frontend/src/query/persister.ts](../frontend/src/query/persister.ts). Product entities are per-query Dexie records; the meta record holds `mutations`, `channelQueries`, and the **`schemaVersion`** pointer (global lens ordinal).

- Pointer behind the bundle: a **migration pass runs before hydration**. Every persisted product-entity query record maps through `migrateCachedEntity()` (including the stx key rewrite); `channelQueries` rows and `meta.mutations` variables go through the same engine (`entityTypeOf` in [cache-migration.ts](../frontend/src/query/cache-migration.ts) recognizes both classes).
- Writes are **chunked** (200 rows per Dexie transaction) and the pointer advances atomically in the final meta write, so a crash-resume re-runs idempotently.
- Pointer ahead of the bundle (another tab migrated forward, or a rollback deploy): the bundle **marks itself stale, restores nothing, and never writes**. A wipe would destroy the newer tab's migrated cache; a rollback recovers on the next forward deploy.
- **Session scopes** (`s-<uuid>`) are wiped on pointer mismatch, not migrated.
- **Leader gating**: the pass runs only under a Web Lock; followers wait before restoring.

### Queued mutation replay

Seam: `resumePausedMutations()` after `waitForActiveCatchup()` in [frontend/src/query/provider.tsx](../frontend/src/query/provider.tsx). Mutations were rewritten on disk in the same transaction chain as the pointer, so they replay in current shape with consistent `stx.fieldTimestamps`. In-memory pending mutations during a live PWA update are covered by the reload flow (the new bundle restores rewritten mutations from disk). Squashing (`squashPendingMutation` / `coalescePendingCreate` in [squash-utils.ts](../frontend/src/query/offline/squash-utils.ts)) runs post-migration, so field keys always match.

### Backstop

Every lens migration is idempotent, so the backstop is small:

- Boot detects an interrupted pass (pointer behind): **re-run the whole chain** over the affected scope; mixed old/new rows are safe.
- A row that still fails a downstream Zod parse: evict that single query record (refetch on demand). Never fleet-wide.
- A migrated mutation that still fails replay with a 4xx: quarantine to the `failed_sync` Dexie table ([failed-sync.ts](../frontend/src/query/offline/failed-sync.ts)), never drop; shown in a non-blocking banner with JSON export.
- No doba `identify()`, `tryParse`, or steady-state Zod parsing of the cache.

### Multi-tab + PWA coordination

Closes the race where an old-bundle tab persists old-shape rows after a new-bundle tab migrates.

- **Schema-version broadcast**: [tab-coordinator.tsx](../frontend/src/query/realtime/tab-coordinator.tsx) announces `currentSchemaVersion` on the existing BroadcastChannel at init. A tab seeing a higher version marks itself stale and stops persisting; a tab seeing a lower one re-announces so late-booting old tabs learn.
- **Persist guard**: [schema-version-guard.ts](../frontend/src/query/schema-version-guard.ts) plus the persister: a stale bundle never writes, and the flush path also checks the on-disk pointer directly because the broadcast can race the first write.
- **PWA update**: [reload-prompt.tsx](../frontend/src/modules/common/reload-prompt.tsx) polls every 15 min and on visibility/online and shows the refresh prompt that replaces the stale bundle.

### CI guards

1. **`lens:check`** ([shared/scripts/check-lenses.ts](../shared/scripts/check-lenses.ts)), in root `pnpm check` and the CI lint job (with `fetch-depth: 0` for the history compare):
   1. **Append-only**: any committed lens module differing from its first-commit blob fails.
   2. **Config-collision**: every lens `delta` field name is checked against reserved surfaces (the frozen envelope, CDC counter field reads, `appConfig.productEmbeddings[].hostColumn`, `hostsByEmbeddedProduct`), plus contract-requires-prior-expand.
   3. **Purity**: no `await`, no value-dependent logic beyond declared `custom` converters, no dynamic key access from input data.
   4. **Contract completeness**: every configured product/channel entity type must call its `evolutionContract` factory in `backend/src/modules`.
2. **oasdiff gate** (`schema-bust-gate` in ci.yml): a breaking OpenAPI diff fails the PR unless `clientCacheVersion` was bumped. Add an "or a lens module was added" pass condition before lens #1, or shipping a lens forces a pointless cache bust.

### Telemetry

- doba hooks: `onTransform`/`onStep` feed otel histograms (`lens.transform.duration`, per lens id); `ctx.defaulted`/`warnings` feed counters. Only the server-side registry gets these hooks (client: dev-only `debug: true`).
- `X-Client-Version` distribution is the fleet-floor view: contract only when the floor has passed the expand lens's ordinal for `expandWindowMinDays`.
- Client-side failures land in `failed_sync` ([Backstop](#backstop)); a server-side DLQ is Phase 2.

### Testing

- **Engine** (shared): [engine.test.ts](../shared/src/schema-evolution/tests/engine.test.ts) covers per-delta-kind derivation, round trips (forward then backward = identity modulo declared loss), and timestamp-map consistency; [engine-empty.test.ts](../shared/src/schema-evolution/tests/engine-empty.test.ts) asserts every seam is a passthrough while the lens list is empty.
- **Seams** (backend): [lens-seam.test.ts](../backend/src/core/schema-evolution/tests/lens-seam.test.ts) covers widening and normalization through the contract factories, including a synthetic lens.
- **Client** (frontend, Vitest + fake-indexeddb): `boot-migration.test.ts` covers old-shape records and queued mutations with the registry one ahead (rewritten rows, advanced pointer, replay in new shape, crash-resume idempotency).
- **E2E (with lens #1)**: the offline runbook in the [playbook](#lens-playbook).
