# Research: Version-Tolerant Schema Evolution

> **Status**: Research / concept. No implementation yet.
> Investigates how backend schema changes affect (a) offline-persisted client state and (b) planned API interoperability between Cella forks.
> Related: [sync engine](./SYNC_ENGINE.md), [multi-fork analysis](./SYNC_ENGINE.md).

---

## TL;DR

A breaking backend schema change (e.g., rename `name` → `title`) quietly breaks two things:

1. **Offline clients** — cached data and queued mutations still use the old shape → blank fields, silent data loss on replay.
2. **API peers** (planned) — another Cella/Raak fork on its own release schedule suddenly sends/receives shapes this backend no longer understands.

Both are **version skew**. The answer: make the API boundary **version-tolerant** so old and new shapes coexist, instead of forcing every consumer to upgrade in lockstep.

**Proposed mechanism**: Cambria-style **bidirectional lenses** (expand/contract, parallel change) as small, frozen, append-only modules that:
- Up-migrate old-shaped requests and down-migrate responses at the server edge
- Are replayed by the client to migrate its IndexedDB cache in place

**Three payoffs from one mechanism**:
- **Sync engine**: caches never need busting, offline mutations never break → no thundering herd, no lost edits.
- **Bounded cache upgrade**: every client's cache migrates locally (no refetch) within a deploy cycle.
- **Interoperability**: fork-to-fork calls survive each side evolving independently.

A full reset (`apiVersion` bump) is kept only as a rare **backstop** for true wire/transport/auth protocol breaks.

---

## Why This Matters Here

This template targets **online learning / exam environments with 300–1000 concurrent users** who need data **instantly and uninterrupted** (mid-exam, mid-quiz). That makes *availability* co-equal with *correctness*:

- Any strategy that interrupts active users (synchronized cache wipe) is a no-go during a session.
- The long-term vision includes **multiple collaborating forks** → API will have consumers it does not deploy in lockstep.
- It can happen during that a deploy that migrations and API deploy but frontend fails. Even if frontend succeeds, there is a window beteren frontend being updated and the PWA on the client being installed. In that window, the frontend doesnt know yet about the new sdk/schema/types.

Version tolerance is the property that serves both.

---

## The Problem in Detail

### Face 1: The Sync Engine Silently Breaks

When `task.name` → `task.title`:
- **Cached query data** still has `{ name }`; frontend reads `task.title` → `undefined` → blank UI.
- **Pending offline mutations** carry `ops: { name }` → won't replay cleanly against new contract.

Existing freshness mechanisms **miss pure schema migrations**:

| Mechanism | Why it misses a schema migration |
|-----------|----------------------------------|
| `syncStaleTime` = Infinity (stream live) | Mounted queries never refetch on their own |
| Catchup seq comparison (`s:{type}`) | Rename doesn't bump per-row `seq` → delta = 0 → no refetch |
| `entityCounts` integrity check | Row count unchanged → passes |
| SSE live notifications | No notification emitted for deploy/migration |

**No schema-version gating on persisted cache today**:
- Persister stores raw dehydrated entities (`buster` always `''`)
- Dexie upgrades migrate only table *layout*
- Queries hydrate **as-is** with no Zod re-validation

### Why Old-Shape Mutations Are Unsafe to Replay

The update contract is `z.object(opsShape).partial()` ([update-schema.ts](../backend/src/core/stx/update-schema.ts)). Zod strips unknown keys, then `.refine` requires ≥1 op **after** stripping:

| Change | Server behavior | Client result |
|--------|-----------------|---------------|
| Rename, *some* ops survive | Strips renamed field, applies the rest | **Silent partial loss** |
| Rename, *all* ops renamed | Refine fails → 400 | Optimistic rollback + toast, **edit lost** |
| Type change (`string`→`number`) | Validation error → 400 | Rollback + toast, **edit lost** |
| Create w/ renamed/required field | 400 (full-body schema) | Rollback + toast, **entity lost** |
| Purely additive (new optional field) | Applies fine | **Works** |

> **Key finding**: "Just try/catch and see what sticks" does **not** work safely. Old-shape mutations result in **silent partial application** or **hard rejection**. This is the strongest argument for making the boundary *tolerant* so old shapes are upgraded, never blindly replayed.

### Face 2: Cross-Fork API Interoperability (Planned)

Roadmap envisions **multiple Cella/Raak forks collaborating** — each deploys on its **own schedule** with a **divergent entity model**. The moment another fork is a consumer, you lose the "client and server ship together" assumption.

This is the classic [PublishedInterface](https://martinfowler.com/bliki/ParallelChange.html) situation: an interface with external, independently-released clients.

---

## Core Solution: Version-Tolerant Boundary

Instead of deploying a breaking change *as* a breaking change, split it into phases that are each **individually additive** (Parallel Change / expand/contract):

### Expand → Migrate → Contract (`name` → `title`)

1. **Expand** — add `title` alongside `name`. Backend writes both, reads prefer `title`, API returns both. Purely additive → **no cache bust, no herd, no interruption**.
2. **Migrate** — backfill `title`; consumers move to `title` as they naturally redeploy/reload.
3. **Contract** — once telemetry shows nobody uses `name`, drop it. Now a no-op removal.

Every phase is non-breaking, so the disruptive machinery (cache busting, version negotiation failures) **never fires** for most changes.

### Cambria: Maintain One Truth, Tolerate Many Versions

[Cambria](https://www.inkandswitch.com/cambria/) (Ink & Switch, 2020) uses **bidirectional lenses** — a single transformation that runs both forward and backward. We adopt:

- **Lens pattern**: One human-written transform generates runtime, schema, and cache-migration artifacts
- **Translate-on-read**: Store raw writes in the writer's schema; translate at read time via lens chain
- **Lens graph**: Schemas are nodes, lenses are edges; find shortest path between any two versions (critical for fork mesh)

**Key Cambria findings we adopt**:
1. **Translate-on-read, not write** — avoids write-time ordering problems and performs better (lazy).
2. **Schemas aren't linear** — branches, merges, and forks require a graph, not a chain.
3. **One lens → many artifacts** — runtime code, TypeScript types, JSON Schema all derived from one source.

---

## One Mechanism, Three Payoffs

A **lens module** carries three halves, all derived from the **same** human-written transform:

- **Runtime transform** (up-migrate requests, down-migrate responses) at the server edge
- **Schema declaration** (what the contract looked like at that version) for spec generation
- **Cache-migration transform** the client replays over its IndexedDB to rewrite stored rows

Because lens modules are **ordered, frozen, and append-only**, the client can compose exactly the missing ones to bring any cached row up to current shape.

### Example Module

```ts
// shared/src/version-changes/2026-06-01-task-name-to-title.ts
// Frozen once shipped. Append-only — never edited, only superseded.
// Shared by backend AND frontend (lives in shared/ or re-exported to client bundle).

import { z } from '@hono/zod-openapi';
import { maxLength } from '#/...';
import { defineLens } from './define';

export default defineLens({
  id: '2026-06-01-task-name-to-title',
  entityType: 'task',
  description: 'Rename task.name → task.title',

  // SCHEMA half — declarative diff vs. previous version (drives spec generation)
  schema: { rename: { from: 'name', to: 'title' } },

  // EXPAND: widen wire contract to accept BOTH shapes (Postel's Law)
  expandOps: { title: z.string().max(maxLength.field) },

  // RUNTIME: request old → new (runs before validation / resolveUpdateOps)
  upgradeRequest(ops) {
    if ('name' in ops && !('title' in ops)) {
      return { ...ops, title: ops.name, name: undefined };
    }
    return ops;
  },

  // RUNTIME: response new → old (so old consumer still reads `name`)
  downgradeResponse(entity, { peerVersion }) {
    if (peerVersion < THIS_VERSION) {
      return { ...entity, name: entity.title };
    }
    return entity;
  },

  // CACHE-MIGRATION: old → new, applied to stored IndexedDB row
  migrateCachedEntity(entity) {
    if ('name' in entity && !('title' in entity)) {
      return { ...entity, title: entity.name, name: undefined };
    }
    return entity;
  },
});
```

### Payoff 1: Version-Tolerant Sync Engine

- **Request path** — `upgradeRequest` maps `ops.name → ops.title` *before* validation. Renamed field is **preserved, not stripped**; HLC/LWW resolution sees `title`; ≥1-op refine passes. A 10-day-PWA-late client posting `ops: { name }` **succeeds** — no silent loss, no 400, no rollback.
- **Response path** — `downgradeResponse` dual-emits `name` for old clients, so cached UIs keep reading `task.name` while new UIs read `task.title`.
- **No cache invalidation** → no reset, no bust → **no thundering herd, no interruption**.

### Payoff 2: Version-Tolerant API Interoperability

For a peer fork, the *same* module lets independently-deployed backends talk:
- Fork B (pinned to last month) sends `ops: { name }` → Raak's `upgradeRequest` upgrades it.
- Raak's response is down-migrated to Fork B's advertised version (`Accept-Version` header).
- Business logic and DB only ever deal with `title`; all backward-compat lives in frozen modules.

### Payoff 3: Bounded Client Cache Migration

The cache is **migrated, not just read tolerantly**. Lazy upgrade-on-read alone is insufficient: a row never touched would stay in its old shape **indefinitely** — unacceptable for exam contexts.

Instead, the client runs a **real migration pass over IndexedDB**, bounded to complete within a deploy cycle, **locally without refetching**:

1. Persist a **cache pointer**: ordinal of last applied lens module (replaces today's always-`''` `buster`).
2. On new bundle boot, compare pointer to bundled lens registry.
3. If behind, replay each missing module's `migrateCachedEntity` over affected rows, in order.
4. Advance pointer. **No network round-trip per row** → 300–1000 clients migrating costs the server **nothing**.

**Bounded window**: Migration is gated on "first boot of new bundle." Pair with PWA update prompt and **staleness deadline**: a client running a bundle older than deadline must update before continuing (426/N-1 window). Telemetry on cache pointer tells you when every client has crossed a module → safe to contract.

---

## Where Version Changes Live: Repo Layout

Version changes are **executable transform code**, not data → belong in **version-controlled files**:

```text
shared/src/version-changes/
  index.ts                              # ordered registry (append imports)
  2026-06-01-task-name-to-title.ts      # frozen module
  2026-07-15-task-title-to-label.ts     # frozen module
```

- **Append-only by CI** — lint/test fails if any committed module is edited after first commit. Git history = audit log.
- **Deterministic ordering** — date-prefixed filenames sort into total order (same as [backend/drizzle/](../backend/drizzle/)').
- **Real, type-checked code** — transforms validate against Zod schemas at build time. No `eval`, no deserialized logic.
- **Ships atomically with deploy** — app loads its own transforms at startup. No bootstrap ordering problem.
- **Shared with client** — same module file feeds server runtime *and* client `migrateCachedEntity`. Single source of truth.

### Module Factory (`defineLens`)

```ts
// shared/src/version-changes/define.ts
export interface Lens<E extends ProductEntityType = ProductEntityType> {
  id: string;                    // Date-ordered, globally unique
  entityType: E;                 // Which entity this touches
  description: string;           // Human-readable
  schema: SchemaDelta;           // Declarative diff (for spec generation)
  expandOps?: z.ZodRawShape;     // Wire widening for EXPAND phase
  upgradeRequest?: (ops: AnyOps) => AnyOps;
  downgradeResponse?: (entity: AnyEntity, ctx: ResponseCtx) => AnyEntity;
  migrateCachedEntity?: (entity: AnyEntity) => AnyEntity;
}

export function defineLens<E extends ProductEntityType>(lens: Lens<E>): Lens<E> {
  return Object.freeze(lens);
}
```

### Registry (`index.ts`)

```ts
// shared/src/version-changes/index.ts
import taskNameToTitle from './2026-06-01-task-name-to-title';
import taskTitleToLabel from './2026-07-15-task-title-to-label';

export const lenses = [taskNameToTitle, taskTitleToLabel] as const;
export const currentVersion = lenses.length;
export const changesAfter = (n: number) => lenses.slice(n);
export const changesForEntity = (e: ProductEntityType) =>
  lenses.filter((c) => c.entityType === e);
```

### Common Transform Primitives

```ts
// shared/src/version-changes/ops.ts
export const rename = <T extends Record<string, unknown>>(
  o: T, from: keyof T, to: string
): T => (from in o && !(to in o) ? { ...o, [to]: o[from], [from]: undefined } : o) as T;

export const alias = <T extends Record<string, unknown>>(
  o: T, src: keyof T, as: string
): T & Record<string, unknown> => (src in o ? { ...o, [as]: o[src] } : o);

export const drop = <T extends Record<string, unknown>>(
  o: T, key: keyof T
): Omit<T, typeof key> => ({ ...o, [key]: undefined } as any);
```

### Generating Versioned OpenAPI Specs

**The problem**: OpenAPI specs are derived from `routes/task.ts`. If routes are unchanged (lenses applied in middleware only), the generated spec remains unchanged — but we need **each version's spec to reflect the schema at that version** (e.g., V1 spec must show both `name` AND `title` during expand phase).

**The solution**: Apply lenses **during spec generation**, not just at runtime. A plugin to `generate-openapi.ts` replays the lens chain newest→oldest to reconstruct each historical spec:

```ts
// backend/scripts/generate-openapi.ts (existing) + lens plugin
import { lenses } from '#/shared/version-changes';
import { applyLensToOpenApiSpec } from './lens-spec-plugin';

// 1. Generate latest spec from routes (unchanged flow)
const latestSpec = await generateLatestOpenApiSpec();

// 2. Replay lenses backward to emit prior versions
const versionedSpecs: Record<string, OpenAPIV3.Document> = {};
versionedSpecs[latestSpec.info.version] = latestSpec;

let currentSpec = latestSpec;
for (const lens of [...lenses].reverse()) {
  currentSpec = applyLensToOpenApiSpec(currentSpec, lens, 'reverse');
  versionedSpecs[lens.id] = currentSpec;
}

// 3. Write each to /openapi/{version}.json
for (const [version, spec] of Object.entries(versionedSpecs)) {
  await fs.writeFile(`backend/openapi/${version}.json`, JSON.stringify(spec, null, 2));
}
```

**How `applyLensToOpenApiSpec` works**:

| Lens `schema` | Spec Transformation (Reverse) | Spec Transformation (Forward) |
|--------------|-------------------------------|-------------------------------|
| `rename: { from: 'name', to: 'title' }` | Add `name` back, keep `title` | Remove `name`, only `title` |
| `add: { name: 'priority', type: 'number' }` | Remove `priority` | Add `priority` |
| `drop: { name: 'legacyField' }` | Add `legacyField` back | Remove `legacyField` |

This is the **fourth artifact** from each lens (runtime, cache, spec, types) and ensures:
- V0 spec = `name` only
- V1 spec = `name` + `title` (expand phase)
- V2 spec = `title` only (contract phase)

**Publishing**: Serve at `/openapi/{version}.json` + expose via `/versions` discovery endpoint for fork mesh Phase 3.

---

## Supporting Mechanisms

### Tolerant Reader on Cache Hydration

**Safety net** covering the brief gap between new bundle loading and cache-migration pass completing (and any row a migration missed).

- Run Zod schema on hydrate. During rollover window, old field is kept optional so both shapes validate.
- A row still in old shape is **coerced in memory** via the same lens chain before UI sees it.
- A row that fails even that is **evicted + refetched individually** (never fleet-wide).

> This is a backstop to bounded cache migration, not a replacement. The on-disk rewrite guarantees data doesn't stay stale.

### oasdiff — Breaking-Change Detection in CI

[oasdiff](https://github.com/oasdiff/oasdiff) classifies changes between OpenAPI specs as breaking vs. non-breaking.

**Gate every PR**: A breaking change must ship *either*:
- A lens module (additive refactor), **or**
- An explicit `apiVersion` bump (true protocol break only).

### Telemetry — "Is It Safe to Contract Yet?"

Contract phase needs runtime answer to *"Is any consumer still on the old shape?"*

**Sources**:
- Server-side `failed_mutations` dead-letter table (rejection counts per entity/version).
- Per-request version stamp from each consumer (client bundle version / peer `Accept-Version`).

**Decision**: Contract only when the **fleet-wide floor** (minimum active consumer version) has passed the change that introduced the new field.

---

## Backstop: True Protocol Break → Bump `apiVersion`

The only break version tolerance cannot absorb: change to the **envelope itself** — `stx`/`ops` wire format, auth/session contract, streaming protocol.

**Mechanism**:
- `apiVersion` baked into **session cookie name** (`${slug}-session-${apiVersion}`).
- Bumping it **invalidates every existing session** → forces clean re-auth and fresh client load.

**Guardrails (exam constraint)**:
1. **Defer, never interrupt mid-task** — gate forced re-auth behind "safe to interrupt" check (idle / between sessions).
2. **Thundering herd is real** — synchronized re-auth + cold client load = latency spike. Mitigate with:
   - Client jitter
   - Lazy/throttled refetch
   - TTL-cache pre-warm
3. **Rescue pending mutations first** — mutations authored under old `apiVersion` must be quarantined before reset.

> Version-tolerant boundary ensures this backstop fires **almost never**.

### Pending-Mutation Rescue

When a mutation cannot be safely applied (version boundary or un-tolerable break), **never silently drop it**:

| | Client `failed_sync` (Dexie) | Server `failed_mutations` (Postgres) |
|---|---|---|
| Survives client reset | ✅ Yes | ✅ Yes |
| Survives device loss | ❌ No | ✅ Yes |
| Cross-device | ❌ No | ✅ Yes |
| Holds never-pushed offline edits | ✅ **Yes** | ❌ No |

- **Client table**: Non-blocking banner + **JSON export**. Primary store for purely-offline edits.
- **Server table**: Dead Letter Queue pattern. Strongest justification: **observability** — answers "safe to contract?" and turns silent loss into alertable signal.
- Both are **quarantines**: never auto-applied; replayed only after deterministic migration or human-confirmed repair, idempotent via `stx.mutationId`.

---

## Strategy Comparison

| | Version-Tolerant Boundary (Primary) | `apiVersion` Reset (Backstop) |
|---|---|---|
| User interruption | **None** | Deferred to idle only |
| Thundering herd | **None** (cache migrates locally) | Mitigated (jitter/throttle/pre-warm) |
| Stale cache on disk | **Migrated within deploy cycle** | Wiped + reloaded |
| Cache after change | **Stays warm** | Cold (re-auth + reload) |
| Offline edits across change | Preserved (upgraded) | Export-only rescue |
| Fork interoperability | **Yes** (same lenses) | No |
| Implementation cost | Medium (discipline + lenses) | Low (reuses `apiVersion`) |
| Correctness risk | **Very low** | Low |

---

## Recommended Approach (Build Order)

1. **Runtime lens pattern** — `version-changes/` directory + `defineLens` + request up-migration before validation + response down-migration. *Pays for itself on sync engine alone.*
2. **Translate-on-read** — tolerant reader on product-entity hydration (in-memory coerce via lens chain + per-record evict-on-fail).
3. **Client cache-migration pass** — cache pointer + boot-time replay of `migrateCachedEntity` over Dexie (local, no refetch) + staleness deadline.
4. **oasdiff in CI** — additive/breaking verdict per PR, wired to `generate-openapi.ts` / `openapi.manifest.json`.
5. **Telemetry** — cache-pointer + `failed_mutations` + version stamping → fleet-floor query.
6. **`apiVersion` backstop** — idle-gated forced re-auth/reload for true protocol breaks, with jitter/throttled refetch/TTL pre-warm/reload-loop breaker.
7. **Client `failed_sync`** rescue + JSON export.
8. **Fork mesh** — content-hashed schemas + lens graph + bidirectional version negotiation + `/versions` discovery endpoint + published Overlays.

---

## Open Questions (Prioritized)

### Blockers
1. **Lens shape** — Finalize `defineLens` API (runtime + cache + schema halves) and shared module publishing to both bundles.
2. **Translate-on-read vs. migrate-on-boot** — Decide if migrate-on-boot is optimization or requirement (exam constraint suggests requirement).
3. **Cache pointer + migration pass** — Where pointer lives (Dexie meta row vs. `buster` slot), how `migrateCachedEntity` applies across tables, transactionality, crash-resume.

### Nice-to-Haves
4. **Staleness deadline** — What bundle age forces update? How interacts with PWA prompt + N-1 window?
5. **Tolerant-reader scope** — Zod coercion on all product-entity hydration, or only during declared rollover windows?
6. **"Safe to contract" threshold** — What cache-pointer fleet-floor + time-window declares a field dead?
7. **oasdiff integration** — Wire into existing `diffHash` / `openapi.manifest.json` pipeline. Where is additive/breaking verdict recorded?
8. **Reload-loop breaker** — Forced re-auth/reload after `apiVersion` bump must fetch new bundle with circuit breaker (after N failed upgrades → quarantine).
9. **Fork negotiation protocol** — `Accept-Version` semantics, shared-core contract definition, divergent entity model handling.

---

## Related Work: Cambria (Conceptual Blueprint)

[Cambria](https://www.inkandswitch.com/cambria/) (Ink & Switch, 2020) is the closest conceptual ancestor. **Key takeaways we adopt**:

1. **Bidirectional lenses** — Single transform runs both forward and backward.
2. **Operates on patches/edits** — JSON Patch ops, not whole documents (matches our `ops` wire format).
3. **Lens graph** — Schemas are nodes, lenses are edges; shortest-path routing handles branches/divergent forks.
4. **Translate-on-read** — Store raw writes in writer's schema; translate lazily on read. *Proven in production local-first app.*
5. **One lens → three artifacts** — Runtime code, TypeScript types, JSON Schema all derived from one source.
6. **Stored with document** — Lenses embedded in docs so old clients can retrieve them (we publish at well-known URLs).

**Where we differ**: Cambria targets local-first CRDT systems; we target **centralized API + offline cache + fork mesh**. But the transform/cache core maps directly.


## References

- [Parallel Change — Martin Fowler / Danilo Sato](https://martinfowler.com/bliki/ParallelChange.html)
- [Cambria — Ink & Switch](https://www.inkandswitch.com/cambria/) ([github](https://github.com/inkandswitch/cambria))
- [Stripe API versioning](https://stripe.com/blog/api-versioning)
- [oasdiff — OpenAPI breaking-change detection](https://github.com/oasdiff/oasdiff)
- [OpenAPI Overlay 1.0.0](https://spec.openapis.org/overlay/v1.0.0.html)
- [Jazz 2.0 migrations](https://jazz.tools/docs/schemas/migrations) ([garden-co/jazz](https://github.com/garden-co/jazz))
- [Confluent Schema Registry](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)
- [RFC 9745 (Deprecation header)](https://www.rfc-editor.org/rfc/rfc9745)
- [RFC 8594 (Sunset header)](https://www.rfc-editor.org/rfc/rfc8594)
- [SYNC_ENGINE.md](./SYNC_ENGINE.md)
- [frontend/src/query/persister.ts](../frontend/src/query/persister.ts)
- [backend/src/core/stx/update-schema.ts](../backend/src/core/stx/update-schema.ts)
- [backend/scripts/generate-openapi.ts](../backend/scripts/generate-openapi.ts)
