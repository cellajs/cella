# Schema evolution (doba lenses)

> **Status**: the lens system is fully wired and live with an **empty lens list** — every seam is a passthrough no-op. Until lens #1 ships, breaking schema changes use the interim [cache-bust hatch](#cache-bust-interim). Two items remain open before lens #1: the oasdiff lens escape and the [shipping playbook](#lens-playbook); see [Remaining work](#remaining-work). Mechanism: version-tolerant API boundary + local cache migration, built on [doba](https://github.com/karol-broda/doba) (`dobajs`) as the transform/registry engine. Related: [Sync engine](/docs/page/architecture/sync-engine), [Architecture](/docs/page/architecture).
>
> This file is committed and published on the docs site (Architecture → Schema evolution). Forks register their own entities through the same [evolution contract](#evolution-contract) factory; CI (`lens:check` "contract completeness") fails if any configured entity skips it.

---

## TL;DR

Breaking schema changes (e.g., rename `attachment.name` → `attachment.title`) are shipped as **append-only lens modules**. Each lens declares the change once; everything else is derived from that declaration:

1. **Widened wire schemas** (build time): during the expand window, ops/create schemas accept both old and new field names; entity rows carry both columns so responses dual-emit both
2. **Ops normalization** (server, runtime touch point 1): old-shape `ops` + `stx.fieldTimestamps` keys normalized to canonical inside the existing stx resolve path
3. **Client cache migration** (client, runtime touch point 2): boot-time Dexie pass rewrites cached rows + queued mutations locally, no refetch
4. **Versioned OpenAPI specs + response down-migration** (Phase 2 only): for fork mesh negotiation

**Phase 1 has exactly two runtime transformation touch points.** Everything else is build-time schema generation, data-level dual-emit during expand windows, or deferred to Phase 2.

doba provides the migration chain executor, bidirectional migrations, graph path-finding (Phase 2), and telemetry hooks. We provide the lens module convention, the Cella seams, and the OpenAPI artifact.

**Two phases:**

- **Phase 1 (internal version tolerance)**: app's own offline clients survive deploys (PWA skew, mid-exam, offline queue replay). Built; passthrough until lens #1.
- **Phase 2 (fork mesh)**: independently-deployed Cella forks interoperate via version negotiation. Future work.

---

## Cache-bust (interim)

Until the first lens ships and proves itself, breaking schema changes are handled by a simpler, throwaway escape hatch:

1. **`appConfig.clientCacheVersion`** ([shared/config/config.default.ts](../shared/config/config.default.ts)): a string token, colocated with `apiVersion`/`cookieVersion` in the VERSIONING section. Bump it (e.g. `'v1' → 'v2'`) in the **same PR** as any breaking change to a cached entity's wire shape.
2. **Client wipe, mutations preserved**: on boot, [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) compares the persisted version to `appConfig.clientCacheVersion`. On mismatch it wipes cached query data (product records + bundled channel queries) but **keeps queued mutations**, which replay against the fresh cache. A missing version (pre-feature build) seeds without wiping. Session scopes are wiped wholesale.
3. **Mutation salvage**: kept mutations replay; any that 4xx are quarantined to the `failed_sync` Dexie table ([frontend/src/query/offline/failed-sync.ts](../frontend/src/query/offline/failed-sync.ts)) rather than dropped (non-blocking, JSON-exportable).
4. **CI gate**: `schema-bust-gate` in [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs oasdiff on the committed `backend/openapi.cache.json` (base vs head). A breaking diff **fails the PR** unless `clientCacheVersion` was bumped in the same PR. Couple with a `feat!` PR title so release-please cuts a major. The gate is PR-time only: it never blocks the release/deploy jobs.

**Teardown**: when lenses are stable, delete `appConfig.clientCacheVersion`, the persister bust branch, the `failed_sync` quarantine, and the `schema-bust-gate` job; wire the lens engine in its place. No entanglement: the cache-version mechanism and the lens engine are independent.

The `apiVersion` backstop (session-cookie name bump, idle-gated re-auth, jitter/pre-warm) is separate from both and unchanged by the lens system: it versions the protocol, not entity resources (see [Tier 3](#entity-coverage)).

---

## Remaining work

### Open (needed before/at lens #1) ❌

- **oasdiff gate lacks the "or a lens module was added" pass condition**: today the only escape from `schema-bust-gate` is a `clientCacheVersion` bump, so shipping a lens would force a pointless cache bust. Add the lens escape before lens #1.
- **The [shipping playbook](#lens-playbook) is not yet written.** AGENTS.md, SYNC_ENGINE.md, and ARCHITECTURE.md point at this doc for it.

### Deferred (deliberate) ⬜

- Staleness deadline: the `staleBundleMaxDays` knob exists in [config.ts](../shared/src/schema-evolution/config.ts) but has zero consumers; the forced idle-gated reload is unbuilt. Nice-to-have: the persist guard already blocks stale writes.
- Versioned OpenAPI specs (2.1): no replay logic in generate-openapi.ts yet.
- `GET /versions`, `Accept-Version`, `downgradeEntity` call sites (2.2) — the engine function exists with zero callers.
- Server `failed_mutations` DLQ (2.4).
- `contractedLenses` contract-phase bookkeeping (name only, no code anywhere).
- CLI diff→lens derivation (panproto's model): a `cella` CLI step diffs Zod/OpenAPI schemas and _proposes_ the lens module; the developer resolves rename-vs-drop+add ambiguity. Replaces hand-authoring, not the review.

### Lens #1 policy

**No permanent rehearsal lens** (decided 2026-07). Renaming a field purely as a rehearsal pollutes the API forever (lens modules are append-only), and the natural candidate `attachment.name` is a shared `productEntityColumns` base column: renaming it on one entity would diverge from the template convention. The machinery stays fully wired and passthrough; rehearse via a **branch-local lens** (see [playbook](#lens-playbook)) and ship lens #1 when a real breaking change needs it.

---

## Lens playbook

> ❌ **Not yet written** — a prerequisite for lens #1. Required content:
>
> - **Expand PR recipe**: the lens module, the Drizzle expand-migration convention (add + backfill the new column, keep the old), mirror-write window start, `feat!` title / gate interplay.
> - **Verification**: the offline e2e runbook (`pnpm offline` flow: bundle A populates cache + offline edits, swap to bundle B with the lens, reconnect, assert zero data loss and no refetch storm).
> - **Contract PR recipe**: fleet-floor check against `X-Client-Version` telemetry, column drop, and the not-yet-built `contractedLenses` mechanism.
> - **Branch-local rehearsal**: exercising a throwaway lens on a branch without polluting the append-only registry (temporary lens-list entry, never merged; `lens:check` append-only rules apply from first commit on main only).

Authoring note: expect `add` to dominate. Additions are >50% of schema changes in 9 of 10 studied projects ([NoSQL study](https://arxiv.org/pdf/2003.00054)); practical frequency is add-with-default ≫ drop > rename ≈ retype > enum renames > restructuring.

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

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           Phase 2 - fork mesh adds per-version edge transforms (▣)           │
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

---

## Why doba

Verified against doba source (`packages/doba`, v0.1.0):

| Requirement | doba support | Verified |
| --- | --- | --- |
| Bidirectional lenses | `'v0<->v1': { forward, backward }` reversible migrations | `migration.ts`, `resolveMigrations` |
| Declarative single-source transform | pipe builder: `p.rename().map().drop().add()` | helpers docs + playground |
| Lens graph + shortest path (fork mesh) | BFS/Dijkstra, `cost`/`preferred`/`deprecated` edges, `findPath`, `explain()` | `graph.ts`, `registry.ts#L328` |
| Zod compat | Standard Schema v1 (`~standard.validate`); Cella ships Zod 4.4.3 (native SSv1) | `standard-schema.ts` |
| Browser + Node | Zero runtime deps, pure ESM, no Node APIs (`performance.now()` only) | package.json, registry source |
| Hot-path perf | `validate: 'none'` skips all schema validation; `from === to` fast path; graph precomputed at construction | `transformCore`, `transform()` |
| Tolerant reader | `identify` guard map + `tryParse` fallback, `identifyAndTransform()` (not used in Phase 1; see [backstop](#backstop)) | `registry.ts#L837-L926` |
| Telemetry | `hooks.onTransform/onStep/onWarning`, `ctx.warn`/`ctx.defaulted` → `result.meta.warnings/defaults` | `context.ts` |
| Error handling | Errors as values (`Result<T, DobaIssue[]>`), migrations that throw → `transform_failed` issue | `result.ts`, `transformCore` catch |
| Packaging quality | publint + arethetypeswrong in `prepublishOnly`, `files: [dist]` | package.json |

**Risk management for the dependency:**

- Pinned exact (`dobajs@0.1.0`) in [shared/package.json](../shared/package.json); review diffs on every bump.
- MIT, zero deps, ~10 source files → **vendoring into `shared/` is the documented escape hatch** if the project stalls.
- The integration sits behind a thin facade, [shared/src/schema-evolution/engine.ts](../shared/src/schema-evolution/engine.ts), so doba is swappable: only the facade imports `dobajs`.

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

A product entity has two wire shapes (`entity` full row; `ops` partial update with AWSet deltas), but they do **not** need separate transform machinery. For every delta kind except `retype`, the ops-side transform is a pure key rename, identical to the entity-side key change. So:

- **One doba registry per entity type** (entity shape; nodes `v0`, `v3`, ... `current`): used by the client cache migration and Phase 2 `downgradeEntity`
- **One derived key map per lens** (`Record<oldKey, newKey>`) applied to `ops` objects, `stx.fieldTimestamps`, and queued mutation variables; a ~10-line helper, no registry needed
- Only `retype` deltas (rare) declare a custom ops converter in the lens

```ts
// shared/src/schema-evolution/engine.ts (facade: only file that imports dobajs)
const entityRegistries: Record<LensEntityType, Registry<...>>; // doba: cached rows, peer downgrade
const keyMaps: Record<LensEntityType, Record<string, string>>; // ops + stx timestamp keys
```

### D2: Global schema version = lens count; per-entity nodes derived

- `currentSchemaVersion = lenses.length` (global ordinal, monotonic, baked into both bundles from `shared`).
- Per entity type, version **nodes** exist only where that entity changed: attachment lenses at global ordinals 3 and 7 → attachment nodes `v0` (pre-3), `v3`, `v7` (= current). A consumer at global version 5 maps to attachment node `v3` (latest node ≤ 5). This keeps chains short and avoids no-op hops.
- Within the app, chains are linear → BFS. Fork mesh (Phase 2) adds branches → Dijkstra with `deprecated`/`cost` edges. Both are doba built-ins; nothing changes in our code.

### D3: Phase 1 needs no version negotiation for correctness

- **Server writes**: the widened expand-window schema makes old-shape ops _valid_; normalization is presence-based (`'name' in ops` → map to `title`) and unambiguous within an expand window. No header consulted.
- **Cache rows**: version comes from the persisted **cache pointer** (the dedicated `schemaVersion` meta field; the RQ `buster` slot round-trips through PersistQueryClientProvider and must stay `''`), never from inspecting rows.
- `X-Client-Version` is sent from day one, but in Phase 1 it is **telemetry-only** (fleet floor for contract gating). It becomes a correctness input only in Phase 2, where `Accept-Version` drives response down-migration for arbitrarily-old peers.

### D4: Canonical shape inside; dual-emit at the edge during expand

- DB business logic, CDC, activitiesTable, TTL entity cache, SSE notifications: **newest shape only** (plus the mirrored old column during an expand window).
- Responses need **no per-request transform in Phase 1**: during expand, the row contains both columns (Drizzle backfill + mirror writes), so responses dual-emit both field names with zero work. Per-version `downgradeEntity` exists only in Phase 2 for peers, applied _after_ TTL cache read (canonical cache, no per-version fragmentation).
- The **frozen envelope** is exempt from lensing and may only change via `apiVersion` bump: `stx`/`ops` wire structure, `StreamNotification`, `CatchupChangeSummary`, counter key formats (`sequence`, `e:f:{type}`/`e:f:h:{type}`, `e:c:{type}`/`e:c:h:{type}`), auth/session contract, SSE/WebSocket protocol. Enforced by the `lens:check` config-collision rule.

### D5: Old schema versions are derived, not snapshotted

We never snapshot full entity Zod schemas per version. The doba registry's older schema nodes are **generated at startup** by reverse-applying each lens's declarative delta to the current canonical schema (`.omit()` / `.extend()` on Zod objects). The same replay logic will power the versioned OpenAPI artifact (2.1). Hot paths use `validate: 'none'`, so these derived schemas matter only for tests, tolerant-reader `tryParse`, and spec generation.

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

Supported `delta` kinds (each with deterministic forward/backward/spec/timestamp derivations): `rename`, `add` (with default for backward-compat fill), `drop`, `retype` (requires `custom` converters), `setRename` (rename of an AWSet field).

Design details of the module format:

- **Default-as-function for `add`** (`resolveAddDefault` in [define.ts](../shared/src/schema-evolution/define.ts)): `default` may be a pure `(row) => value` (still passing the purity lint). Covers "new field derived from existing ones", the gap Cambria flagged as unsolved ("no mechanism to look up missing data").
- **The lens-module format is itself versioned** (`formatVersion` + `LENS_FORMAT_VERSION`, stamped/validated by `defineLens`). This is Cambria's "lens inception" open problem; modules are append-only and immortal, so day-one was the cheap moment.
- **`unknownFieldHandling` policy knob** (`ignore | strip | fail`, default `strip`, in `schemaEvolutionPolicy`; modeled on LiveStore's `unknownEventHandling`): `normalizeOps` handles post-lens unmappable fields per policy when callers pass `canonicalKeys`, and always reports them via `unknownFields` (hosts log/otel).
- **Non-goals**: no restructuring ops (`hoist`/`plunge`, `wrap`/`head`, `in`/`map`). Cambria's appendix shows scalar↔array has only trade-offs, and Cella's flat SQL-backed rows rarely nest; model rare restructures as `drop` + `add`-with-computed-default. One-to-many splits / cross-entity moves stay outside the lens system as one-off scripts (unsolved by Cambria and DXOS alike).
- **Future adjustment worth stealing** (panproto, per Diskin et al. lenses-with-complement): stash `drop`-removed values in a side-channel so round-trips are lossless. Cheap for queued mutations; most relevant to Phase 2 peer downgrades.

The derived `fieldTimestamps` key map is applied wherever stx travels: server-side `normalizeOps` (incoming `stx.fieldTimestamps`), cache migration (stored entity `stx`), and queued mutation rewrite. **This closes the LWW-skew gap**: without it, a renamed scalar would lose its HLC history and an older offline edit could win.

---

## Entity coverage

The lens system covers both entity classes under a **three-tier contract**; the non-entity protocol surface stays versioned.

| Surface | Write path | Client cache | Lens coverage |
| --- | --- | --- | --- |
| **Product entities** (`attachment`) | stx ops + HLC/AWSet per-field merge via `resolveUpdateOps` | per-query Dexie records, seq/catchup, offline queue | **Tier 1, full**: all four artifacts |
| **Channel entities** (`organization`; `user` follows the same plain-REST pattern, add when first needed) | plain `PUT`, full-body partial (drizzle-zod); no ops, no stx, no HLC | bundled into the single Dexie meta record (`channelQueries`), no seq | **Tier 2, reduced derivation**: body-schema widening + `normalizeBody` + cache/mutation migration + dual-emit reads. No key maps, no `fieldTimestamps` rewriting, no mirror-write LWW logic: no per-field merge exists on this path. |
| **Non-entity surface** (auth/session, stx/ops envelope, SSE notifications, catchup summaries, counter formats) | frozen envelope (D4) | n/a | **Tier 3, excluded**: changes only via `apiVersion` |

Why Tier 2 matters for Phase 1 (not just Phase 2 optics): channel mutations _are_ queued offline (`networkMode: 'offlineFirst'` is global; `shouldDehydrateMutation` persists any paused mutation regardless of entity type). An org rename queued under an old bundle must replay correctly against a new server. Both entity classes share one lens ordinal, one telemetry chain, and the same CI guards, so what a peer or 3rd party consumes is uniform: **every resource** is version-tolerant under the same rules, and the protocol advertises `apiVersion` — the standard industry split (Stripe's model: payload down-migration per consumer version, transport/auth versioned as a whole).

Boundary notes:

- **Membership**: rides on channel entities via enrichment and has its own table/wire shape; treat its fields as frozen-envelope-adjacent until a concrete need arises. Enrichment output (`membership`, `can`, `ancestorSlugs`) is computed, not stored, so cache migration never touches it.
- **Channel entities stay on plain PUT by design**: moving them onto ops+stx was considered and rejected — it would drag them into CDC/seq/catchup scope for no user-visible gain and contradicts the deliberately lightweight channel design (SYNC_ENGINE.md). The factory aligns the **schema/tolerance layer**, not the **merge layer**.
- **Full-API tolerance was rejected**: lensing the frozen envelope would mean transforming the sync protocol itself per consumer version — the exact trap Cambria hit patch-lensing Automerge internals (D4, [Prior art](#prior-art)).

---

## Evolution contract

Every wire body is an **entity body**, full (create) or partial (update), optionally accompanied by `stx`. An `ops` object _is_ a partial entity body; a context PUT body is the same thing without stx. Widening (old-name aliases) and normalization (canonical keys + expand mirror writes) are body-level operations; the only sync-specific extra is rewriting `stx.fieldTimestamps` keys, and the presence of `stx` is exactly the discriminator.

So there is **one registration point per entity module** ([backend/src/core/schema-evolution/evolution-contract.ts](../backend/src/core/schema-evolution/evolution-contract.ts)), with two factories under one `evolutionContract` object (clearer TypeScript inference than a single factory with a class flag):

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

- **One widener**: `widenBodySchema(entityType, zodObject)` ([lens-seam.ts](../backend/src/core/schema-evolution/lens-seam.ts)) is applied to every derived schema — create bodies, product ops shapes ([update-schema.ts](../backend/src/core/schema-evolution/update-schema.ts)), and channel partial bodies. One implementation of the lens alias derivation.
- **One runtime normalizer core**: `normalizeBody(entityType, body)` (a thin `normalizeOps` wrapper) for plain bodies; every create/update operation calls its contract-bound seam first thing.
- **`createItem` stays a module-assembled ZodObject** rather than being derived from a shared field source: create schemas carry picks, defaults, and batch refines that a raw-shape union can't express without reinventing drizzle-zod. The update shape is still declared exactly once (in `updateOps`/`updateBody`, adjacent to `createItem` in the same call).
- **Typed by construction**: the factories are generic over the raw shapes (`z.ZodObject<S>` parameters, not a `ZodObject<ZodRawShape>` constraint, which would collapse inference to `Record<string, unknown>` and silently degrade the generated SDK).
- **Completeness is CI-enforced**: `lens:check` rule 4 asserts every `appConfig` product/channel entity type calls its contract factory in `backend/src/modules` — a (fork) entity can never silently miss the seams.

Update _semantics_ stay divergent by design: product updates merge per-field (HLC/AWSet over `{ ops, stx }`), channel updates stay full-body-partial PUT with server-authoritative last-write. Likewise create vs update keep different _shapes_ (full vs partial, create-only fields): the factory aligns their _source and derivation_, not their contracts.

---

## Phase 1: how it works

### Version telemetry header

- `currentSchemaVersion` (= lens count) is exported from [shared/src/schema-evolution](../shared/src/schema-evolution/index.ts) and baked into each bundle at build time.
- **Frontend**: the fetch wrapper in [frontend/src/lib/api-client.ts](../frontend/src/lib/api-client.ts) sets `X-Client-Version` on every SDK request — one place, covers the whole generated SDK. No SSE changes (notifications carry no entity fields).
- **Backend**: [client-version.ts](../backend/src/middlewares/client-version.ts) (mounted on all routes) feeds the `schema.client_version.seen` otel counter ([schema-version-metrics.ts](../backend/src/lib/schema-version-metrics.ts)); [lens-telemetry.ts](../backend/src/lib/lens-telemetry.ts) wires doba's transform hooks into otel.
- The version distribution is the **fleet floor** for "safe to contract". Phase 2 upgrades the same header pattern into a correctness input for peers.

### Engine API

[engine.ts](../shared/src/schema-evolution/engine.ts) exposes the only API the rest of the codebase uses:

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

All calls use `validate: 'none'` (zod-openapi / Dexie context validate elsewhere); `from === to` short-circuits in doba make the steady-state cost ~zero. Policy knobs live in [config.ts](../shared/src/schema-evolution/config.ts): `expandWindowMinDays: 14`, `staleBundleMaxDays: 30`, `unknownFieldHandling: 'strip'`.

### Server write path

No middleware, no body re-parsing, no Hono internals. Two derived pieces, both reached through the [evolution contract](#evolution-contract):

1. **Widened wire schemas (build time)**: while a lens is in its expand window, the derived ops/create/body Zod schemas accept **both** field names (old optional alias generated from `delta`, never hand-edited in module schemas). Old-shape requests pass OpenAPIHono validation unchanged, including curl/tests that send no version header.
2. **Normalization at the existing seam (runtime)**: `resolveUpdateOps` ([backend/src/core/stx/resolve-update.ts](../backend/src/core/stx/resolve-update.ts)) and the create/body seams call `normalizeOps` first thing:
   - apply lens key maps to `ops` and `stx.fieldTimestamps` (old → canonical),
   - during expand, **mirror-write** the twin column (new client sends `title` → also writes `name`; old client sends `name` → also writes `title`) so every reader sees fresh data in whichever field its bundle knows,
   - run `custom.opsConvert` for `retype` lenses.

HLC/LWW resolution and AWSet application then operate on canonical keys only. This is the **only server-side runtime touch point**, and it sits in code the sync engine already owns.

### Read path

Phase 1 deliberately has **no response-side transform**:

- During expand, the entity row carries both columns (Drizzle migration adds + backfills the new column; mirror writes keep both fresh). Responses, TTL-cache entries, and seq-cursor delta fetches all dual-emit both field names with zero per-request work.
- **Contract is the enforcement point**: the old column/field is removed only when the `X-Client-Version` fleet floor has passed the expand ordinal for `expandWindowMinDays`. Automation of this check is Phase 2 (2.5); until then it is a manual step in the contract PR (playbook).
- SSE notifications and catchup summaries are untouched either way (frozen envelope: IDs and seqs only).
- Tradeoff (accepted): expand windows live for days-to-weeks; old+new columns coexist in DB and payloads. Standard parallel-change practice: costs bytes, not transforms.
- Per-version `downgradeEntity` (a true response transform) arrives only in Phase 2, where peers can be arbitrarily many versions behind.

### Client cache migration

Seam: [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) `migrateScopeToCurrent`. Product entities are per-query Dexie records; the meta record holds `mutations` + `channelQueries` and a dedicated **`schemaVersion`** pointer field (the global lens ordinal; see D3 for why not the `buster` slot).

- Pointer behind the bundle → **migration pass before hydration**: every persisted product-entity query record maps through `migrateCachedEntity()` (includes stx key rewrite); `channelQueries` rows and `meta.mutations` variables are rewritten via the same engine (`entityTypeOf` in [cache-migration.ts](../frontend/src/query/cache-migration.ts) recognizes both product and channel types).
- Writes are **chunked** (200 rows per Dexie transaction) with the pointer advanced atomically in the final meta write → crash-resume re-runs idempotently (migrations are idempotent by construction: renaming an already-renamed field is a no-op).
- Pointer ahead of the bundle (another tab migrated forward, or a rollback deploy) → the bundle **marks itself stale, restores nothing, never writes** — not "backward-migrate or wipe". The common case is a stale tab beside a newer tab (a wipe would destroy the newer tab's migrated cache); a genuine rollback is rare, is a no-op within an expand window, and recovers on the next forward deploy. The PWA update flow replaces the stale bundle.
- **Session scopes** (`s-<uuid>`): wiped on pointer mismatch instead of migrated (they're allowed to be cold; avoids migrating dozens of orphaned scopes).
- **Leader gating**: the pass runs only under a Web Lock; followers wait before restoring.
- No network involved: hundreds of clients migrating costs the server nothing. Covered by [boot-migration.test.ts](../frontend/src/query/tests/boot-migration.test.ts).

### Queued mutation replay

Seam: `resumePausedMutations()` runs after `waitForActiveCatchup()` in [frontend/src/query/provider.tsx](../frontend/src/query/provider.tsx).

- Mutations were already rewritten on disk in the same transaction chain as the pointer; they replay in current shape with consistent `stx.fieldTimestamps`.
- In-memory pending mutations during a live PWA update (SW swap without full reload) are covered by the reload flow: the new bundle restores rewritten mutations from disk.
- Squashing (`squashPendingMutation` / `coalescePendingCreate` in [squash-utils.ts](../frontend/src/query/offline/squash-utils.ts)) operates post-migration, so field keys always match: no cross-version squash bugs.

### Backstop

Because every lens migration is idempotent by construction, the backstop is trivial:

- If boot detects an interrupted pass (pointer behind), **re-run the whole chain** over the affected scope: idempotency makes mixed old/new rows safe.
- Any row that still fails a downstream Zod parse → evict that single query record (refetch on demand). Never fleet-wide.
- Any migrated mutation that still fails replay with a 4xx is quarantined to the `failed_sync` Dexie table ([failed-sync.ts](../frontend/src/query/offline/failed-sync.ts)) — never dropped; surfaced in a non-blocking banner with JSON export.
- No doba `identify()`, no `tryParse`, no steady-state Zod parsing of the cache. (Identify-based shape detection is reconsidered only if Phase 2 peer payload auditing needs it.)

### Multi-tab + PWA coordination

The race this closes: an old-bundle tab persisting old-shape rows after a new-bundle tab migrates.

- **Schema-version broadcast**: [tab-coordinator.tsx](../frontend/src/query/realtime/tab-coordinator.tsx) announces `currentSchemaVersion` on the existing BroadcastChannel at init; a tab seeing a _higher_ version marks itself stale (stops persisting), a tab seeing a _lower_ one re-announces so late-booting old tabs learn.
- **Persist guard**: [schema-version-guard.ts](../frontend/src/query/schema-version-guard.ts) + persister — a stale bundle never writes; the flush path also checks the on-disk pointer directly (broadcast can race the first write).
- **PWA update**: [reload-prompt.tsx](../frontend/src/modules/common/reload-prompt.tsx) polls every 15 min + on visibility/online and shows the refresh prompt, replacing the stale bundle. The _forced_ staleness deadline (`staleBundleMaxDays`, idle-gated) is unbuilt (deferred ⬜) — nice-to-have now that the guard blocks stale writes.

### CI guards

1. **`lens:check`** ([shared/scripts/check-lenses.ts](../shared/scripts/check-lenses.ts)), in root `pnpm check` and the CI lint job (with `fetch-depth: 0` for the history compare):
   1. **Append-only**: any committed lens module differing from its first-commit blob fails.
   2. **Config-collision**: every lens `delta` field name is checked against reserved surfaces — the frozen envelope (D4), CDC counter field reads, `appConfig.productEmbeddings[].hostColumn`, `hostsByEmbeddedProduct` — plus contract-requires-prior-expand.
   3. **Purity**: no `await`, no value-dependent logic beyond declared `custom` converters, no dynamic key access from input data.
   4. **Contract completeness**: every configured product/channel entity type must call its `evolutionContract` factory in `backend/src/modules`.
2. **oasdiff gate** (`schema-bust-gate` in ci.yml): breaking OpenAPI diff fails the PR unless `clientCacheVersion` was bumped. ❌ Still needs the "or a lens module was added" pass condition before lens #1 (see [Remaining work](#remaining-work)).

### Telemetry + failure capture

- doba hooks: `onTransform`/`onStep` → otel histograms (`lens.transform.duration`, per lens id); `ctx.defaulted`/`warnings` → counters. Server-side registry created with these hooks; client-side registry without (or dev-only `debug: true`).
- `X-Client-Version` distribution → fleet-floor view: contract allowed only when the floor has passed the expand lens's ordinal for `expandWindowMinDays`.
- Client-side failures land in `failed_sync` (see [Backstop](#backstop)); the server-side DLQ is Phase 2 (2.4) — internal clients are covered by the client table + version telemetry.

### Testing

- **Engine tests** (shared): [engine.test.ts](../shared/src/schema-evolution/tests/engine.test.ts) — per-delta-kind derivation + round-trip tests (forward∘backward = identity modulo declared loss), timestamp-map consistency; [engine-empty.test.ts](../shared/src/schema-evolution/tests/engine-empty.test.ts) asserts every seam is a passthrough while the lens list is empty.
- **Seam tests** (backend): [lens-seam.test.ts](../backend/src/core/schema-evolution/tests/lens-seam.test.ts) — widening + normalization through the contract factories, including a synthetic lens.
- **Client tests** (frontend, Vitest + fake-indexeddb): `boot-migration.test.ts` — old-shape records + queued mutations, lens registry one ahead → rewritten rows, advanced pointer, replay in new shape; crash-resume idempotency.
- **E2E (with lens #1)**: the offline runbook — build bundle A, populate cache + offline edits, swap to bundle B with the lens, reconnect, assert zero data loss and no refetch storm. Part of the [playbook](#lens-playbook).

---

## Phase 2: fork mesh

Builds on Phase 1's lens registry; adds negotiation between independently-deployed Cella forks whose entity models diverge. Not started; items below are in dependency order.

### 2.1 Versioned OpenAPI spec artifact

- Extend [generate-openapi.ts](../backend/scripts/generate-openapi.ts): after producing the latest spec, replay lens `delta`s newest→oldest to emit each historical spec at `backend/openapi/{ordinal}.json`. Pure JSON-schema rewrites driven by the same `delta` kinds — the lens's fourth artifact.
- Expand-phase specs show both field names; contract-phase specs show only the new one.
- SDK generation ([sdk/openapi-ts.config.ts](../sdk/openapi-ts.config.ts)) stays single-spec (current version): versioned specs are **for peers**, not for our own SDK.

### 2.2 Version discovery + negotiation

- `GET /versions` (unauthenticated, cacheable): `{ apiVersion, schemaVersion, lenses: [{ id, entityType, phase }], specs: '/openapi/{v}.json' }`.
- Peer requests carry `Accept-Version: <schemaVersion>` (and identify as peers via existing auth: service tokens / org-scoped credentials, reusing `checkAccess()` guards; **no new auth surface**).
- Server behavior: peer requests flow through the same write-path seam (key maps cover the live expand window; older peers get an explicit doba chain upgrade before `normalizeOps`; context bodies go through the same widener/normalizer). Responses gain the **first true response transform**: `downgradeEntity(entity, peerVersion)` applied post-TTL-cache on all entity routes (Tier 1+2) when `Accept-Version < currentSchemaVersion`. `lossyBackward` lenses omit rather than restore removed fields (security: a field dropped for exposure reasons must not reappear for old peers).
- Unknown/too-old version (no path in the registry graph) → `426 Upgrade Required` with the `/versions` URL: explicit, never silent.

### 2.3 Cross-fork lens graphs (where doba pays off)

- A fork's registry = upstream cella lenses + fork-local lenses. Schema nodes get namespaced ids (`cella:v7`, `fork:v3`) and the graph **branches**: exactly doba's model (schemas are nodes, migrations are edges, Dijkstra with `deprecated`/`cost` edges picks routes).
- Shared-core contract: forks interoperate on the **upstream entity subset** (entities + fields defined in cella core). Fork-divergent fields are dropped with `ctx.defaulted` telemetry when crossing the boundary (lossy edge, costed higher).
- The `cella` sync CLI gains a check: fork-local lenses must not collide with upstream lens ids (date-prefix + fork namespace makes this mechanical).
- Peer-to-peer calls between forks at different upstream baselines route through the shared upstream chain: `forkA@v3 → cella:v7 → cella:v5 → forkB@v2`. doba `findPath` + `explain()` give debuggable routing; `pathStrategy: 'direct'` available for pinned contracts.

### 2.4 Server `failed_mutations` DLQ

- Postgres table: `{ id, peerOrClientVersion, entityType, entityId, mutationId, body jsonb, issues jsonb, createdAt }`.
- Written when up-migration or validation fails for a versioned consumer (after lens path attempts). Never auto-replayed; idempotent manual replay via `stx.mutationId`.
- Primary value: observability. Alertable signal that some consumer is broken + audit trail for repair.

### 2.5 Contract lifecycle automation

- Header-distribution telemetry feeds a "safe to contract" check: contract lens PRs are CI-blocked unless the fleet floor (internal clients **and** registered peers) has passed the expand ordinal for the configured window.
- Sunset/Deprecation headers (RFC 8594/9745) emitted on responses served to consumers more than N lenses behind.

---

## Known challenges

1. **Expand windows are long-lived state**: old+new columns coexist for days-to-weeks, and overlapping expand windows for the same entity must compose (key-map chains are order-sensitive). Covered by chain property tests; worth a "max concurrent expand lenses per entity" lint.
2. **doba maturity**: v0.1.0, single maintainer. Mitigated by facade + pin + vendoring path, but worth a periodic health check; if we hit a bug, contributing upstream is cheaper than forking. Phase 1 exercises it only as a chain executor, so the blast radius is small.
3. **Derivation in `engine.ts`** (delta → schema widening, key maps, doba migrations, spec deltas) is our code, not doba's. It is the highest-correctness-risk module and gets the densest property tests.
4. **`retype` deltas** (e.g., `string → number`) need `custom` converters and may be genuinely lossy backward; policy decision per lens (`lossyBackward` + telemetry) rather than a general solution.
5. **Yjs-edited description fields** are outside the lens system (CRDT binary, separate worker); renaming a description-derived field touches the Yjs derived-fields PATCH contract; treat as frozen-envelope-adjacent until needed.
6. **Expand-phase mirror writes** produce dual deltas in CDC `changedFields` and slightly larger payloads during the window: accepted noise, documented.

---

## Prior art

The lens approach here is not novel: it composes well-established ideas. Useful background for anyone extending the system:

### The lens model (closest prior art)

- **Project Cambria: "Translate your data with lenses"** (Ink & Switch). Bidirectional lenses for evolving document schemas in local-first apps, with forward/backward transforms and graph-based version resolution. `doba` is effectively a typed, modern take on this model. <https://www.inkandswitch.com/cambria/> · code: <https://github.com/inkandswitch/cambria-project> · paper (PaPoC '21): <https://dl.acm.org/doi/10.1145/3447865.3457963>
  - Op vocabulary: `rename`, `add`, `remove`, `hoist`/`plunge` (nesting), `wrap`/`head` (scalar↔array), `in`/`map` (nested), `convert` (arbitrary, breaks round-trip guarantees; our `retype` is the same trade).
  - Hard-won lessons we follow: lens at the wire/patch boundary, never inside CRDT internals (patch-lensing Automerge's op format is what killed [cambria-automerge](https://github.com/inkandswitch/cambria-automerge)); tag data with writer schema, translate at read/ingest; defaults mandatory on add/drop. Open problems they left: computed defaults, scalar↔array (six strategies, none correct), one-to-many splits, lens-format versioning ("lens inception").
- **panproto**, the notable 2024-2026 advance: Rust engine (TS bindings) that diffs schema versions and **auto-generates bidirectional lenses**, with machine-checked lens laws, lenses-with-**complement** (lossless drop/restore round-trips), complement-cost pathfinding, and per-edit translation pipelines. Very active (v0.56.x, 2026). Too general to depend on; steal the complement idea and diff→lens derivation. <https://github.com/panproto/panproto> · <https://panproto.dev/> · <https://docs.rs/panproto-lens/latest/panproto_lens/>
- **Local-first software** (Ink & Switch): motivates offline-tolerant schema migration and sync. <https://www.inkandswitch.com/local-first/>
- **`doba` / `dobajs`**: the transform/registry engine this plan builds on. Note its pipe ops are `rename`/`map`/`drop`/`add` only; our `retype` and `setRename` are extensions in the facade. <https://github.com/karol-broda/doba>

### How local-first sync engines handle this today (2025-2026 survey)

- **Automerge**: no built-in migration support; cookbook says hand-write versioned upgrade functions; Cambria's ideas "not yet implemented". The gap this plan fills is still open in the flagship CRDT. <https://automerge.org/docs/cookbook/modeling-data/>
- **Jazz**: `withMigration` runs on load, per-value, unidirectional; docs admit no guard against mixed-version concurrency. Validates our bidirectional ambition. <https://jazz.tools/docs/react-native/schemas/accounts-and-migrations>
- **DXOS ECHO**: stop-the-world **Epochs** + `MigrationBuilder`; explicitly names Cambria-style lenses as the missing fix for stale-peer writes. <https://dxos.org/blog/decentralized-schema-changes-and-data-migrations/>
- **Zero (Rocicorp)**: no transforms. Schema-hash handshake, incompatible clients rejected, manual expand/contract discipline. Our plan is essentially Zero's discipline automated by lenses; their client rejection is our Phase 2 `426` backstop. <https://zero.rocicorp.dev/docs/zero-schema>
- **LiveStore**: event-sourced; versioned event names + an explicit `unknownEventHandling: warn/ignore/fail/callback` policy knob, copied into our `unknownFieldHandling` design. <https://docs.livestore.dev/patterns/app-evolution/>
- **Electric SQL**: punts (plain Postgres migrations). <https://electric-sql.com/docs/usage/data-modelling/migrations>

### Bidirectional transformations (the theory under "lenses")

- **Boomerang / lenses**: Foster, Greenwald, Moore, Pierce & Schmitt, _"Combinators for Bidirectional Tree Transformations: A Linguistic Approach to the View-Update Problem."_ Origin of the well-behaved `get`/`put` lens laws our `forward`/`backward` pairs approximate.
- **Edit lenses / symmetric lenses** (Hofmann, Pierce & Wagner, POPL '11/'12): translating _changes_ (not states) with complements, the formal basis for patch-level lensing of `ops`.
- **Lenses with complement**: Diskin et al. 2011; panproto's foundation and the theory behind the complement idea under [Lens anatomy](#lens-anatomy).
- **BiDEL / InVerDa**: co-existing bidirectionally-linked schema versions in SQL at scale; corroborates the expand-window dual-emit approach. <https://arxiv.org/pdf/1608.05564>
- **Empirical op frequency**: additions dominate schema evolution (>50% of changes in 9 of 10 studied projects): <https://arxiv.org/pdf/2003.00054> · survey: <https://www.worldscientific.com/doi/full/10.1142/S2972370124300012>

### Expand/contract rollout (our `phase: 'expand' | 'contract'`)

- **Martin Fowler: ParallelChange (expand-contract).** <https://martinfowler.com/bliki/ParallelChange.html>
- **Refactoring Databases** (Ambler & Sadalage): catalog of safe, staged schema migrations the `delta` kinds mirror.
- **Evolutionary Database Design.** <https://martinfowler.com/articles/evodb.html>

### Adjacent / corroborating

- **CRDT data migration**: Automerge docs and the Ink & Switch CRDT work; rationale for our lens also rewriting `stx.fieldTimestamps` (HLC) keys, not just field names.
- **Per-consumer API versioning**: Stripe's API-upgrade write-ups describe response down-migration keyed on consumer version, the shape of our Phase 2 `downgradeEntity` + `Accept-Version`.
