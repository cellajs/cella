# Schema evolution

This document explains how breaking changes to entity wire shapes ship without stranding offline clients.

### TL;DR

When the fields returned by the API change incompatibly, add one permanent conversion module that
describes the old and new forms. These modules are called **lenses**. From that description, Cella
accepts both forms during rollout, converts writes to the current form, and updates data already
cached in browsers. No lenses have shipped yet, so the system currently leaves data unchanged.
Until the first real lens is added, use the interim [cache reset](#cache-bust-interim).

## The lens model

A breaking schema change (rename `attachment.name` to `attachment.title`, say) ships as an **append-only lens module**. The lens declares the change once; everything else derives from it: widened request schemas, key maps for writes, and migrations for cached rows.

- **Phase 1 (internal version tolerance)**: the app's own offline clients survive deploys (PWA skew, offline queue replay). Built; passthrough until lens #1.
- **Phase 2 (cross-app negotiation)**: independently deployed Cella apps interoperate via version negotiation. Not started.

The engine is a thin facade over [dobajs](https://github.com/karol-broda/doba) (pinned exact in `shared/package.json`); only [engine.ts](../shared/src/schema-evolution/engine.ts) imports it, so it stays swappable. What a newcomer must keep in mind:

- **Canonical inside, dual-emit at the edge.** Database logic, CDC, the activity log, the detail cache, and SSE see the newest shape only. The **frozen envelope** (`stx`/`ops` wire structure, `StreamNotification`, `CatchupChangeSummary`, counter key formats, auth and session contract, SSE and WebSocket protocol) changes only through an `apiVersion` bump, never through a lens.
- **No version negotiation in Phase 1.** Server normalization is presence-based (`'name' in ops` maps to `title`); the persisted `schemaVersion` pointer, not row inspection, tells the client cache which version it holds. `X-Client-Version` is telemetry only.
- **One global version.** `currentSchemaVersion` is the lens count, baked into both bundles from `shared`.

## Cache-bust (interim)

Until the first lens ships, breaking schema changes use a throwaway escape hatch:

1. **`appConfig.clientCacheVersion`** ([shared/config/config.default.ts](../shared/config/config.default.ts)): a string token next to `apiVersion`/`cookieVersion`. Bump it (`'v1'` to `'v2'`) in the **same PR** as any breaking change to a cached entity's wire shape.
2. **Client wipe, mutations preserved**: on boot, [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) compares the persisted version to `appConfig.clientCacheVersion`; on mismatch it wipes cached query data but **keeps queued mutations**, which replay against the fresh cache. A missing version seeds without wiping. Session scopes are wiped wholesale.
3. **Mutation salvage**: replayed mutations that fail with a 4xx are quarantined in the `failedSync` Dexie table ([failed-sync.ts](../frontend/src/query/offline/failed-sync.ts)) with a JSON export function, never dropped. No UI reads the table yet.
4. **CI gate**: `schema-bust-gate` in [ci.yml](../.github/workflows/ci.yml) runs oasdiff on the committed `backend/openapi.cache.json` (base vs head). A breaking diff **fails the PR** unless `clientCacheVersion` was bumped in the same PR. Pair it with a `feat!` PR title so release-please cuts a major. The gate is PR-time only.

**Teardown**: once lenses are stable, delete `appConfig.clientCacheVersion`, the persister bust branch, the `failedSync` quarantine, and the `schema-bust-gate` job; the lens engine is independent of all four.

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

## Lens anatomy

```text
shared/src/schema-evolution/
  engine.ts      # doba facade: builds registries from lenses
  define.ts      # defineLens factory + types
  config.ts      # schemaEvolutionPolicy knobs
  lens-list.ts   # ordered registry (append-only, currently empty)
```

A lens module, illustrated (no lens has shipped, so no such file exists yet):

```ts
// shared/src/schema-evolution/2026-07-01-attachment-name-to-title.ts
// FROZEN once shipped: CI fails on edits. Append-only.
import { defineLens } from './define';

export default defineLens({
  id: '2026-07-01-attachment-name-to-title',
  entityType: 'attachment',
  description: 'Rename attachment.name → attachment.title',
  phase: 'expand', // 'expand' | 'contract' - drives spec + wire widening

  delta: { rename: { from: 'name', to: 'title' } },

  // Optional escape hatch when delta alone can't express the change
  // (retype, splits/merges). Pure functions; receive doba ctx for
  // ctx.defaulted/ctx.warn telemetry. Rename/add/drop never need this.
  custom?: { entityForward?, entityBackward?, opsConvert? },

  // Security flag: backward direction re-exposes removed data → forbid.
  lossyBackward?: boolean, // if true, Phase 2 downgradeEntity omits instead of restoring
});
```

Supported `delta` kinds: `rename`, `add` (with a default for backward-compat fill; a pure `(row) => value` function covers derived fields), `drop`, `retype` (needs `custom.opsConvert`), `setRename` (rename of an AWSet field). No restructuring ops; model a rare restructure as `drop` plus `add` with a computed default, and keep one-to-many splits and cross-entity moves as one-off scripts. The module format is versioned (`formatVersion`, stamped and validated by `defineLens`), because modules are immortal. Unknown fields left after a lens are handled per `schemaEvolutionPolicy.unknownFieldHandling` (`ignore | strip | fail`, default `strip`).

The derived `fieldTimestamps` key map is applied wherever `stx` travels: server-side `normalizeOps`, cache migration, and queued mutation rewrite. Without it a renamed scalar would lose its HLC history and an older offline edit could win.

## Entity coverage

| Surface | Write path | Client cache | Lens coverage |
| --- | --- | --- | --- |
| **Product entities** (`attachment`) | stx ops + HLC/AWSet per-field merge via `resolveUpdateOps` | per-query Dexie records, seq/catchup, offline queue | **Tier 1, full** |
| **Channel entities** (`organization`) | plain `PUT`, full-body partial; no ops, no stx, no HLC | bundled into the single Dexie meta record, no seq | **Tier 2, reduced**: body-schema widening, `normalizeBody`, cache and mutation migration, dual-emit reads. No key maps or `fieldTimestamps` rewriting, because no per-field merge exists on this path |
| **Non-entity surface** (auth/session, stx/ops envelope, SSE notifications, catchup summaries, counter formats) | frozen envelope | n/a | **Tier 3, excluded**: changes only via `apiVersion` |

Tier 2 matters because channel mutations are queued offline too, so an organization rename queued under an old bundle must replay against a new server. Membership fields, computed enrichment output (`membership`, `can`), and Yjs-edited description fields sit outside the lens system; treat them as frozen-envelope-adjacent.

## Evolution contract

Every wire body is an **entity body**, full (create) or partial (update), optionally with `stx`. Widening (old-name aliases) and normalization (canonical keys plus expand mirror writes) are body-level; the only sync-specific extra is rewriting `stx.fieldTimestamps` keys, and the presence of `stx` is the discriminator.

Each entity module registers once through [evolution-contract.ts](../backend/src/core/schema-evolution/evolution-contract.ts), via one of two `evolutionContract` factories:

```ts
// Product (sync) entity: attachment-schema.ts
export const attachmentContract = evolutionContract.product("attachment", {
  createItem: attachmentCreateBodySchema, // module-assembled ZodObject (drizzle-zod picks, defaults, refines)
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

`createItem` stays a module-assembled ZodObject because create schemas carry picks, defaults, and batch refines a raw shape cannot express; the update shape is declared once in `updateOps`/`updateBody`. Every create and update operation calls its contract-bound seam first.

## Phase 1: how it works

### Engine API

[engine.ts](../shared/src/schema-evolution/engine.ts) is the only API the codebase uses:

```ts
normalizeOps(entityType, ops, stx, options?): { ops, stx, unknownFields } // key maps + mirror writes (server seam)
migrateCachedEntity(entityType, entity, fromVersion): Promise<entity> // doba chain → current (incl. stx keys)
migrateQueuedMutation(entityType, variables, fromVersion): variables  // key maps
widenedOpsKeyMap(entityType): Record<string, string>         // expand-window alias map; call sites widen the Zod schemas
downgradeEntity(entityType, entity, toVersion): Promise<entity> // Phase 2 only (zero callers today)
currentSchemaVersion: number
versionNodeFor(entityType, globalVersion): string            // latest node at or below a global version
configureLensTelemetry(hooks): void                          // host-provided doba hooks
```

Policy knobs live in [config.ts](../shared/src/schema-evolution/config.ts): `expandWindowMinDays: 14`, `staleBundleMaxDays: 30`, `unknownFieldHandling: 'strip'`. `staleBundleMaxDays` has no consumer yet.

### Server write path

No middleware, no body re-parsing. During a lens's expand window the derived ops, create, and body schemas accept both field names, so old-shape requests pass validation unchanged. At the existing seam (`resolveUpdateOps` and the create and body seams), `normalizeOps` applies the key maps to `ops` and `stx.fieldTimestamps`, **mirror-writes** the twin column during expand (a `title` write also writes `name`, and vice versa), and runs `custom.opsConvert` for `retype` lenses. HLC/LWW resolution and AWSet application then see canonical keys only.

### Read path

Phase 1 has no response-side transform. During expand, the row carries both columns (the Drizzle migration adds and backfills the new column; mirror writes keep both fresh), so responses, cache entries, and delta fetches dual-emit both field names for free. Remove the old column only after the `X-Client-Version` fleet floor has passed the expand ordinal for `expandWindowMinDays`; until Phase 2 automates this, it is a manual contract-PR step.

### Client cache migration

Seam: `migrateScopeToCurrent` in [persister.ts](../frontend/src/query/persister.ts); the meta record's `schemaVersion` pointer is the global lens ordinal.

- Pointer behind the bundle: a migration pass runs before hydration over every persisted product query record, the bundled channel queries, and queued mutation variables. Writes are chunked (200 rows per Dexie transaction) and the pointer advances in the final meta write, so a crash-resume re-runs idempotently. The pass runs under a Web Lock; followers wait.
- Pointer ahead of the bundle (another tab migrated forward, or a rollback deploy): the bundle marks itself stale, restores nothing, and never writes.
- Session scopes (`s-<uuid>`) are wiped on pointer mismatch, not migrated.

### Queued mutation replay

`resumePausedMutations()` runs after `waitForActiveCatchup()` in [provider.tsx](../frontend/src/query/provider.tsx). Mutations were rewritten on disk in the same transaction chain as the pointer, so they replay in current shape with consistent `stx.fieldTimestamps`. Squashing runs after migration, so field keys agree.

### Multi-tab and PWA coordination

- [tab-coordinator.tsx](../frontend/src/query/realtime/tab-coordinator.tsx) announces `currentSchemaVersion` on the BroadcastChannel at init. A tab seeing a higher version marks itself stale and stops persisting; a tab seeing a lower one re-announces so late-booting old tabs learn.
- [schema-version-guard.ts](../frontend/src/query/schema-version-guard.ts) plus the persister: a stale bundle never writes, and the flush path also checks the on-disk pointer because the broadcast can race the first write.
- [reload-prompt.tsx](../frontend/src/modules/common/reload-prompt.tsx) polls every 15 min and on visibility or online and shows the refresh prompt that replaces the stale bundle.

### Telemetry

The fetch wrapper sets `X-Client-Version` on every SDK request; [client-version.ts](../backend/src/middlewares/client-version.ts) feeds the `schema.client_version.seen` counter. [lens-telemetry.ts](../backend/src/lib/lens-telemetry.ts) wires doba's transform hooks into `lens.transform.duration_ms` and `lens.step.duration_ms` histograms and a `lens.warnings` counter, server side only.

### CI guards

1. **`lens:check`** ([check-lenses.ts](../shared/scripts/check-lenses.ts)), in root `pnpm check` and the CI lint job (with `fetch-depth: 0` for the history compare): append-only (any committed lens module differing from its first-commit blob fails), config collision (every lens `delta` field name is checked against the frozen envelope and `appConfig.productEmbeddings[].hostColumn`), a purity lint (no `await`, no dynamic `import`), and contract completeness (every configured product or channel entity type must call its `evolutionContract` factory in `backend/src/modules`).
2. **oasdiff gate** (`schema-bust-gate`): a breaking OpenAPI diff fails the PR unless `clientCacheVersion` was bumped. Add an "or a lens module was added" pass condition before lens #1, or shipping a lens forces a pointless cache bust.

### Testing

[engine.test.ts](../shared/src/schema-evolution/tests/engine.test.ts) covers rename and add lenses, a rename round trip, and timestamp-map consistency; [engine-empty.test.ts](../shared/src/schema-evolution/tests/engine-empty.test.ts) asserts the main seams pass through while the lens list is empty; [lens-seam.test.ts](../backend/src/core/schema-evolution/tests/lens-seam.test.ts) covers widening and normalization through the contract factories with a synthetic lens; `boot-migration.test.ts` (frontend, fake-indexeddb) covers pointer advance, stale-when-ahead, and session-scope wipe. `drop`, `retype`, `setRename`, replay in new shape, and crash-resume have no tests yet.
