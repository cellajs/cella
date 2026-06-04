# Research: version-tolerant schema evolution

> **Status**: Research / concept. No implementation yet. Investigates how backend schema changes
> affect (a) offline-persisted client state and (b) planned API interoperability between Cella forks,
> and proposes a single mechanism that addresses both. Related: [sync engine](./SYNC_ENGINE.md),
> [multi-fork analysis](./SYNC_ENGINE.md).

## TL;DR

A breaking backend schema change (e.g. rename `name` → `title`) quietly breaks two things at once:

1. **Offline clients** — their cached data and queued mutations still use the old shape. They render
   blank fields and their offline edits get silently dropped or rejected on replay.
2. **API peers** (planned) — another Cella/Raak fork that calls this API on its own release schedule
   suddenly sends/receives a shape this backend no longer understands.

Both are the same problem — **version skew** — and they have the same answer: make the API boundary
**version-tolerant** so old and new shapes coexist, instead of forcing every consumer to upgrade in
lockstep.

The proposed mechanism is **Cadwyn-style version-change modules** (expand/contract, parallel change):
small, frozen, append-only modules that up-migrate old-shaped requests and down-migrate responses at the
server edge, **and** are replayed by the client to migrate its IndexedDB cache in place. One mechanism,
**three payoffs**:

- **Sync engine:** caches never need busting and offline mutations never break → no thundering herd, no
  lost edits.
- **Bounded cache upgrade:** every client's persisted cache is migrated locally (no refetch) within a
  deploy cycle — no row stays stale indefinitely, no fleet-wide refetch storm.
- **Interoperability:** fork-to-fork calls survive each side evolving independently.

A full reset (`apiVersion` bump) is kept only as a rare **backstop** for true wire/transport/auth protocol
breaks that cannot be made tolerant.

---

## Why this matters here

This template targets workloads like **online learning / exam environments with 300–1000 concurrent
users** who need their data **instantly and uninterrupted** (mid-exam, mid-quiz). That makes *availability*
co-equal with *correctness*: any strategy that interrupts active users — including a synchronized
full-fleet cache wipe — is effectively a no-go during a session. And because the long-term vision includes
**multiple collaborating forks**, the API will eventually have consumers it does not deploy in lockstep.
Version tolerance is the property that serves both.

---

## The problem in detail

### Face 1 — the sync engine silently breaks

When a task's `name` column is renamed to `title`:

- **Cached query data** still has `{ name }`; new frontend code reads `task.title` → `undefined` → blank UI.
- **Pending offline mutations** carry `ops: { name }` and will not replay cleanly against the new contract.

None of the existing freshness mechanisms catch a pure schema migration:

| Mechanism | Why it misses a schema migration |
|-----------|----------------------------------|
| `syncStaleTime` = Infinity while stream live | Mounted queries never refetch on their own |
| Catchup seq comparison (`s:{type}`) | A rename does not bump per-row `seq` → delta = 0 → no refetch |
| `entityCounts` integrity check | Row count unchanged → passes |
| SSE live notifications | No notification is emitted for a deploy/migration |

There is also **no schema-version gating** on the persisted cache today: the persister
([frontend/src/query/persister.ts](../frontend/src/query/persister.ts)) stores raw dehydrated entities
(`buster` is always `''`), Dexie upgrades migrate only table *layout*, and queries hydrate **as-is** with
no Zod re-validation.

### Why old-shape mutations are unsafe to replay

The update contract is `z.object(opsShape).partial()`
([backend/src/core/stx/update-schema.ts](../backend/src/core/stx/update-schema.ts)). Zod strips unknown
keys, then `.refine` requires ≥1 op **after** stripping. An old-shape mutation replayed after a breaking
change therefore lands in one of these states:

| Change | Server behavior | Client result |
|--------|-----------------|---------------|
| Rename, *some* ops survive | strips renamed field, applies the rest | **silent partial loss** |
| Rename, *all* ops renamed | refine fails → 400 | optimistic rollback + toast, **edit lost** |
| Type change (`string`→`number`) | validation error → 400 | rollback + toast, **edit lost** |
| Create w/ renamed/required field | 400 (full-body schema) | rollback + toast, **entity lost** |
| Purely additive (new optional field) | applies fine | **works** |

> **Key finding:** "just try/catch and see what sticks" does *not* work safely — the only outcomes for an
> old-shape mutation are **silent partial application** or **hard rejection**. This is the strongest
> argument for making the boundary *tolerant* so old shapes are upgraded, never blindly replayed.

### Face 2 — cross-fork API interoperability (planned)

The roadmap envisions multiple Cella/Raak forks collaborating — Raak calling Fork B's API and vice versa
(see [multi-fork service sharing analysis](./SYNC_ENGINE.md) for the isolation constraints). Each fork
deploys on its **own schedule** and has a **divergent entity model** (Raak `task`, Fork B `ticket`). The
moment another fork is a consumer, you lose the "client and server ship together" assumption that makes
breaking changes survivable. This is the classic [PublishedInterface](https://martinfowler.com/bliki/ParallelChange.html)
situation: an interface with external, independently-released clients.

---

## The core idea: a version-tolerant boundary

Instead of deploying a breaking change *as* a breaking change, split it into phases that are each
individually additive, so no single deploy invalidates a running consumer. This is **Parallel Change**
(Kerievsky 2006; Fowler/Sato), a.k.a. **expand/contract** — the discipline behind always-on APIs (Stripe,
GitHub, Kubernetes).

### Expand → migrate → contract (`name` → `title`)

1. **Expand** — add `title` alongside `name`. Backend writes both, reads prefer `title`, API returns both.
   Purely additive → **no cache bust, no herd, no interruption.**
2. **Migrate** — backfill `title`; consumers move to `title` as they naturally redeploy/reload (days–weeks).
3. **Contract** — once telemetry shows nobody uses `name`, drop it. By now it is a no-op removal.

Every phase is non-breaking, so the disruptive machinery (cache busting, version negotiation failures)
**never fires** for the vast majority of changes.

### Cadwyn: maintain one truth, tolerate many versions

[Cadwyn](https://github.com/zmievsa/cadwyn) (FastAPI, MIT) is the clearest open-source expression of this:
you maintain only the **latest** schema and business logic, and declare each breaking change as a small
**version-change module** that knows how to translate between the old and new shapes. It is *single source
of truth → many tolerated versions* (not "only one API version") — Cadwyn generates and serves the older
ones from the module chain. We adopt both its **module pattern** and its **multi-version spec generation**,
because we are targeting the full fork mesh (see [Scope](#scope-the-full-fork-mesh-committed-target)).

---

## One mechanism, three payoffs

A version-change module carries three halves, all derived from the **same** human-written transform:

- a **runtime** transform (up-migrate requests, down-migrate responses) at the server edge,
- a **schema** declaration (what the contract looked like at that version) for spec generation, and
- a **cache-migration** transform the client replays over its IndexedDB to rewrite stored rows.

Because Cadwyn modules are **ordered, frozen, and append-only**, the client can replay exactly the missing
ones to bring any cached row up to current shape — the same property that makes Drizzle migrations safe,
applied to the client cache.

```ts
// backend/src/core/stx/version-changes/2026-06-01-task-name-to-title.ts
// Frozen once shipped. Append-only — never edited, only superseded.
// Shared by backend AND frontend (lives in shared/ or is re-exported to the client bundle).
export const taskNameToTitle = defineVersionChange({
  id: '2026-06-01-task-name-to-title',
  entityType: 'task',
  description: 'Rename task.name → task.title',

  // SCHEMA half — what the contract looked like at the previous version
  // (consumed by spec generation / interoperability negotiation).
  schema: { rename: { entity: 'taskUpdate', from: 'name', to: 'title' } },

  // EXPAND: widen the wire contract to accept BOTH shapes (Postel's Law).
  expandOps: { title: z.string().max(maxLength.field) },

  // RUNTIME half — request, old → new (runs before validation / resolveUpdateOps).
  upgradeRequest(ops) {
    if ('name' in ops && !('title' in ops)) {
      ops.title = ops.name;
      delete ops.name;
    }
    return ops;
  },

  // RUNTIME half — response, new → old (so an OLD consumer still reads `name`).
  downgradeResponse(entity, { peerKnowsTitle }) {
    if (!peerKnowsTitle) entity.name = entity.title;
    return entity;
  },

  // CACHE-MIGRATION half — old → new, applied to a stored IndexedDB row.
  // The client replays this (and every later module) once, on first boot of the
  // new bundle, rewriting the persisted cache in place. No network, no refetch.
  migrateCachedEntity(entity) {
    if ('name' in entity && !('title' in entity)) {
      entity.title = entity.name;
      delete entity.name;
    }
    return entity;
  },
});
```

### Payoff 1 — a version-tolerant sync engine

For the offline client, the module makes a rename a non-event:

- **Request path** — `upgradeRequest` maps `ops.name → ops.title` *before* `taskUpdateSchema` and
  `resolveUpdateOps` ([backend/src/core/stx/resolve-update.ts](../backend/src/core/stx/resolve-update.ts))
  run. The renamed field is **preserved, not stripped**; HLC/LWW resolution sees `title`; the ≥1-op refine
  passes. **A 10-minute- (or 10-day-PWA-) late client that still posts `ops: { name }` succeeds — no silent
  loss, no 400, no rollback.**
- **Response path** — `downgradeResponse` dual-emits `name` for clients that haven't rolled over, so old
  cached UIs keep reading `task.name` while new UIs read `task.title`.
- **No cache invalidation** → no reset, no bust → **no thundering herd, no interruption.**

### Payoff 2 — version-tolerant API interoperability

For a peer fork, the *same* module lets two independently-deployed backends talk:

- Fork B, pinned to last month's contract, sends `ops: { name }` → Raak's `upgradeRequest` upgrades it.
- Raak's response is down-migrated to the version Fork B advertises (`Accept-Version` / negotiated floor),
  so Fork B reads the shape it expects.
- Neither fork has to deploy in lockstep with the other.

Business logic and the DB only ever deal with `title`; all backward-compat lives in the frozen modules —
Cadwyn's "maintain only the newest version" principle.

### Payoff 3 — bounded client cache migration (no herd, no stale-forever)

This is the part your offline cache actually needs, and it is where the Cadwyn structure earns its keep.

**The cache is migrated, not just read tolerantly.** Lazy upgrade-on-read alone is rejected: a row that is
never touched again would stay in its old shape on disk **indefinitely**, which an exam/learning context
can't accept. Instead the client runs a **real migration pass over IndexedDB**, bounded to complete within
a deploy cycle — but it does so *locally*, without refetching from the server, so there is **no thundering
herd**.

How it works:

1. The client persists a **cache pointer**: the ordinal/date of the last version-change module it has
   applied (stored alongside the Dexie cache, replacing today's always-`''` `buster`).
2. On boot of a new bundle, it compares that pointer to the bundle's bundled version-change registry.
3. If behind, it **replays each missing module's `migrateCachedEntity`** over the affected IndexedDB rows,
   in order — exactly like a Drizzle migration chain, but over the local cache. A `name`→`title` rename is
   one ordered, deterministic rewrite. It then advances the pointer.
4. This is a **local, offline, one-pass rewrite** — no network round-trip per row, so 300–1000 clients
   migrating at once cost the server **nothing** (contrast with background refetch, which is the herd).

The transform is the **same human-written `migrateCachedEntity`** already shipped for the server boundary —
explicit, ordered, frozen, append-only — replayed over IndexedDB. Cadwyn's structure is what makes a
structured client migration safe instead of ad-hoc.

**Bounded window.** Because the migration is gated on "first boot of the new bundle," every active client
converges as it naturally reloads. To enforce a hard ceiling (the "within a week/month" requirement), pair
it with the PWA update prompt and a **staleness deadline**: a client running a bundle older than the
deadline is required to update before continuing (the `426`/N-1 window from
[Version skew & PWA delivery](#version-skew--pwa-delivery)). Telemetry on the cache pointer tells you the
fleet floor, so you know when every client has crossed a given module and the server may safely contract.

---

## Where version changes live: repo files

Version changes are **executable transform code**, not data — so they belong in **version-controlled
files**, never a database row (the same reason Drizzle, Rails, and Cadwyn migrations are all files). Store
them mirroring the existing [backend/src/core/stx/](../backend/src/core/stx/) layout:

```text
backend/src/core/stx/version-changes/
  index.ts                              # ordered registry (append imports)
  2026-06-01-task-name-to-title.ts      # frozen module
  2026-07-15-task-title-to-label.ts     # frozen module
```

- **Append-only by CI.** A lint/test rule fails if any committed module (except `index.ts`) is edited
  after its first commit. Git history *is* the audit log.
- **Deterministic ordering.** Date-prefixed filenames sort into a total order — same scheme as
  [backend/drizzle/](../backend/drizzle/). Each module names its `entityType`, so "ordinal → entity/field"
  is a registry lookup; per-entity reporting needs no stored state.
- **Real, type-checked code.** Transforms validate against the Zod schemas and `maxLength` constants at
  build time — no `eval`, no logic deserialized from a row.
- **Ships atomically with its deploy.** The app loads its own transforms at startup — no bootstrap ordering
  problem, no dependency on the DB being reachable.
- **Shared with the client.** The same module file feeds the server runtime half *and* the client
  `migrateCachedEntity` half. Put it where both bundles can import it (e.g. `shared/` or re-exported into
  the frontend bundle) so there is a single source of truth for every direction of the transform.

Chained renames (`name`→`title`→`label`) compose by **ordering frozen files**, not by diffing schemas.

### Module file structure

Iterating on the shape of an individual module. The goal: **one file = one breaking change**, fully
self-describing, importable by both bundles, and cheap to compose into a chain.

#### The contract (`defineVersionChange`)

A thin factory that just freezes an object and gives it a type — no runtime magic. It would live in
`shared/` so both backend and frontend import the *same* symbol:

```ts
// shared/src/version-changes/define.ts
export interface VersionChange<E extends ProductEntityType = ProductEntityType> {
  /** Date-ordered, globally unique. Matches the filename. */
  id: string;
  /** Which product entity this change touches (drives registry grouping + telemetry). */
  entityType: E;
  /** One-line human description (shows up in generated changelogs / spec diffs). */
  description: string;

  /** SCHEMA half — declarative diff vs. the *previous* version. Drives spec generation. */
  schema: SchemaDelta;

  /** Wire widening for the EXPAND phase (optional fields added to the update contract). */
  expandOps?: z.ZodRawShape;

  /** RUNTIME half (server edge). All optional — a change rarely needs every direction. */
  upgradeRequest?: (ops: AnyOps, ctx: RequestCtx) => AnyOps;
  downgradeResponse?: (entity: AnyEntity, ctx: ResponseCtx) => AnyEntity;

  /** CACHE-MIGRATION half (client). Old → new, applied to a persisted IndexedDB row. */
  migrateCachedEntity?: (entity: AnyEntity) => AnyEntity;
}

export function defineVersionChange<E extends ProductEntityType>(
  change: VersionChange<E>,
): VersionChange<E> {
  // Identity at runtime; the value of this wrapper is purely type inference +
  // a single place to add dev-time assertions (e.g. id must match filename).
  return Object.freeze(change);
}
```

Key decisions baked into that shape:

- **Every transform half is optional.** A purely-additive change needs *none* of them (it just widens the
  schema). A rename needs all three. A response-only reshaping needs just `downgradeResponse`. The factory
  doesn't force you to write no-op identity functions.

  > **"Additive" means optional-or-defaulted, not just "new."** A new field only qualifies as pure expand if
  > it is **optional** (or carries a server-side default / backfill). A **required** new field is *not*
  > additive — it is a breaking change in disguise, and it breaks in exactly the two ways this whole document
  > is trying to avoid:
  >
  > - **It breaks fork integration.** A peer fork (or any older client) that doesn't yet know the field omits
  >   it → validation fails → `400`. The whole point of expand/contract is that *the previous shape stays
  >   valid*; a required field revokes that the instant it ships.
  > - **It breaks step-by-step cache migration.** Old cached rows have no value for it. `migrateCachedEntity`
  >   would have to *invent* one — which is just a default by another name. If no sensible default exists,
  >   the row can't be migrated locally and you're forced into a refetch (the herd) or eviction.
  >
  > So the rule is: **expand always lands the new field as optional/defaulted first.** Making it required (if
  > ever) is a *separate, later* change — done only after telemetry shows every consumer populates it — and
  > that tightening is itself gated like any other breaking change (its own module, or it simply never
  > happens). "Optional forever" is a perfectly good resting state.
- **`schema` is declarative, the transforms are imperative.** The declarative half (`rename`/`add`/`drop`/
  `retype`) is what oasdiff and the spec generator consume; the imperative halves are what actually runs.
  CI cross-checks them so they can't drift (a `schema.rename` with no matching `upgradeRequest` is a lint
  error).
- **`entityType` is typed to `ProductEntityType`.** Ties each module to the dynamic entity registry, so the
  registry — not a stored table — answers "which modules touch `task`?".

#### A single module file

```ts
// shared/src/version-changes/2026-06-01-task-name-to-title.ts
import { z } from '@hono/zod-openapi';
import { maxLength } from '#/...';
import { defineVersionChange } from './define';

export default defineVersionChange({
  id: '2026-06-01-task-name-to-title',
  entityType: 'task',
  description: 'Rename task.name → task.title',

  schema: { rename: { from: 'name', to: 'title' } },
  expandOps: { title: z.string().max(maxLength.field) },

  upgradeRequest: (ops) => rename(ops, 'name', 'title'),
  downgradeResponse: (e, { floor }) => (floor < THIS ? alias(e, 'title', 'name') : e),
  migrateCachedEntity: (e) => rename(e, 'name', 'title'),
});
```

The three directions all reduce to the *same* primitive (`rename`), so a small shared helper kit keeps each
module to a few lines and makes the common cases impossible to get subtly wrong:

```ts
// shared/src/version-changes/ops.ts — reusable field primitives
export const rename = (o, from, to) =>
  from in o && !(to in o) ? (({ [from]: v, ...rest }) => ({ ...rest, [to]: v }))(o) : o;
export const alias  = (o, src, as) => (src in o ? { ...o, [as]: o[src] } : o); // additive, keeps both
export const retype = (o, key, fn) => (key in o ? { ...o, [key]: fn(o[key]) } : o);
export const drop   = (o, key) => (({ [key]: _omit, ...rest }) => rest)(o);
```

#### The registry (`index.ts`)

The one mutable file. Append-only-by-convention, enforced in CI; ordering is explicit, not filename-magic,
so a reviewer sees the chain in one place:

```ts
// shared/src/version-changes/index.ts
import taskNameToTitle from './2026-06-01-task-name-to-title';
import taskTitleToLabel from './2026-07-15-task-title-to-label';

/** Ordered oldest → newest. The array index IS the version ordinal. */
export const versionChanges = [
  taskNameToTitle,
  taskTitleToLabel,
] as const;

export const currentVersion = versionChanges.length;

/** Helpers the three call sites share. */
export const changesAfter = (n: number) => versionChanges.slice(n);
export const changesForEntity = (e: ProductEntityType) =>
  versionChanges.filter((c) => c.entityType === e);
```

That single ordered array feeds all three consumers without any of them storing version state:

- **Server request path** runs `changesAfter(peerVersion).map(c => c.upgradeRequest)` before validation.
- **Client cache pass** runs `changesAfter(cachePointer).map(c => c.migrateCachedEntity)` over Dexie, then
  sets `cachePointer = currentVersion`.
- **Spec generator** folds `versionChanges` newest→oldest over the latest OpenAPI doc to emit each prior
  version.

#### Variants worth supporting

| Change kind | `schema` | Transforms needed |
|-------------|----------|-------------------|
| Add **optional** field | `add` | none (pure expand) |
| Add **required** field | — | **not additive** — land it optional/defaulted first (pure expand), tighten to required later as a separate gated change, if ever |
| Rename field | `rename` | `upgradeRequest` + `downgradeResponse` + `migrateCachedEntity` |
| Type change (`string`→`number`) | `retype` | all three (with a coercion fn, and a fallback for unparseable old values) |
| Split/merge fields | `custom` | hand-written all three; `schema: { custom: true }` opts out of auto-diff checks |
| Drop field (contract phase) | `drop` | none at expand time; the module is a no-op transform that only records the version bump |

#### Settled structure

- **One file per change.** Each file stays frozen and tiny (mirrors Drizzle); per-entity files would reopen
  "edit a shipped file" and lose the audit guarantee.
- **Default export.** The filename is the single identifier and registry imports stay uniform.
- **Helpers in `shared/`.** `ops.ts` primitives live in `shared/` so the *exact same* `rename` runs on the
  wire and on the cache — the strongest guarantee that all three directions agree.
- **Loose entity typing.** `AnyEntity`/`AnyOps` stay `Record<string, unknown>`. A frozen module must not be
  coupled to a Zod type that later changes; the transform is validated by CI against the schema *as of its
  own version*, not the current one.

---

## Scope: the full fork mesh (committed target)

We are building for the **heaviest tier — a mesh of independently-deployed forks** that call each other's
APIs. That commitment settles several earlier open points: we adopt **Cadwyn's full multi-version spec
generation**, publish per-version specs and Overlays, and add fork-to-fork version negotiation. The phases
below are therefore **a single committed roadmap**, not a menu — each is a superset of the last.

| Phase | Consumer reached | Adds |
|------|----------|---------------|
| **1** | First-party SPA/PWA shipped together | Runtime up/down-migration modules + client cache-migration pass + tolerant reader |
| **2** | External clients of one API | Multi-version spec generation (single-truth → many generated versions) at versioned paths + published Overlays |
| **3 (target)** | Another fork's API, deployed independently | Bidirectional version negotiation + a guaranteed shared-core contract |

Phase 3 adds two things beyond single-app Cadwyn:

- **Bidirectional negotiation.** A mesh is many providers that are also each other's consumers, so each
  call must agree a common version (content negotiation / `Accept-Version`). Single-app Cadwyn only ever
  *downgrades* toward older clients; a mesh negotiates both directions.
- **A shared-core contract.** Forks don't just have *older* versions of the same schema — they have
  *different* entity models. So peers must agree on the **Cella core** (`user`, `organization`) and treat
  fork-specific entities as additive/ignorable. This is **schema-registry-style compatibility**
  (Confluent `BACKWARD`/`FORWARD`/`FULL`) layered *on top of* Cadwyn-style versioning.

> **Sequencing, not hedging:** Phase 1 pays for itself on the sync engine alone and ships first, but every
> module's `schema` half is populated **from day one** so the Phase 2 generator and Phase 3 negotiation
> inherit the data they need with no rework. Write every module as if the mesh already exists.

### Aggregating modules into the OpenAPI spec

The proven protocol (Cadwyn, Stripe) is **spec-per-version by replay**: author only the latest schema; the
generator replays the frozen modules' `schema` halves newest→oldest to reconstruct each historical
OpenAPI document. Our pipeline already has the seam —
[backend/scripts/generate-openapi.ts](../backend/scripts/generate-openapi.ts) +
[backend/openapi.manifest.json](../backend/openapi.manifest.json) (where `diffHash` lives):

- **Phase 1:** emit the current spec (as today) + record the version-change registry in the manifest
  (`{ versions, changes }`) so the SDK knows the rollover windows.
- **Phase 2/3:** replay the modules to emit one OpenAPI doc per active version and publish the matching
  Overlays.
- **oasdiff** validates the invariant in CI: the diff between generated `v(n-1)` and `v(n)` must match what
  the module claims, catching a module whose schema and runtime halves have drifted apart.

### How a version change is expressed *in* OpenAPI 3.1 (Phase 3)

There is **no native version-change construct in OpenAPI 3.1** — a spec describes *one* shape of the API,
not the deltas between shapes. So "document the `versionChanges` as part of the spec" resolves to two
complementary, standardized artifacts, and `defineVersionChange` sits exactly on the seam between them.
The `.ts` module stays the single source of truth; everything below is **generated from it** by the
pipeline we already have — a peer fork never runs our code, it fetches a language-neutral file at a URL.

**1. The resolved per-version spec (what a peer's codegen consumes).** This is the Cadwyn/Stripe
spec-per-version replay above: a plain OpenAPI 3.1 document per version, served at a discoverable URL
(`/openapi/2026-06-01.json`). A fork integrating with us points its generator at the version it pins.

**2. The delta itself, as an [OpenAPI Overlay 1.0.0](https://spec.openapis.org/overlay/v1.0.0.html)
document (what describes the *change*).** Overlay (OpenAPI Initiative, Oct 2024) is the standardized
format for *"a repeatable, ordered set of transformations applied to an OpenAPI description."* That is
precisely a version change. Each module compiles to one Overlay file — an ordered list of `update`/`remove`
actions targeting JSONPath nodes, with an `extends:` URL pointing at the base spec. The mapping is near 1:1:

| `defineVersionChange` (`schema` half) | Overlay 1.0.0 |
|---|---|
| `id` / `description` | `info.version` / `info.title` |
| `rename { from, to }` | `update` adding the new property + `remove: true` on the old node |
| `add` (optional field) | `update` adding the property under `…/properties` |
| `drop` | `remove: true` on the property node |
| ordered registry | one Overlay per change; Overlays compose (each applies to the previous result) |

```yaml
# generated: overlays/2026-06-01-task-name-to-title.overlay.yaml
overlay: 1.0.0
info: { title: 'Rename task.name → task.title', version: '2026-06-01' }
extends: ./openapi/2026-05-15.json
actions:
  - target: $.components.schemas.Task.properties.title
    update: { type: string }
  - target: $.components.schemas.Task.properties.name
    remove: true
```

The `schema` half of every module already carries exactly this declarative diff (`rename`/`add`/`drop`/
`retype`), so emitting the Overlay is a pure projection — no new source of truth, and the same data
[oasdiff](https://github.com/oasdiff/oasdiff) checks. Publishing Overlays (rather than only resolved specs)
lets a peer **replay our changes onto its own divergent base** instead of diffing two full documents.

**3. In-spec discovery — `x-` extensions + standard headers.** To answer *"when did this field appear /
when does it die?"* inside the spec, use the conventional extension + header layer (again, no native
field):

- `x-since-version` / `x-deprecated-since` on schemas and fields (the only standard mechanism for
  custom metadata is the `x-` prefix).
- `Deprecation` + `Sunset` response headers ([RFC 9745](https://www.rfc-editor.org/rfc/rfc9745) /
  [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594)) on the contract-phase responses.
- A small **discovery endpoint** — `GET /versions` → `[{ version, specUrl, overlayUrl, sunset }]` — so a
  peer can enumerate available versions and fetch the right artifact by URL. This is the
  `{ versions, changes }` manifest data, served.

Stripe's programmatically-generated changelog and per-account field warnings are produced exactly this
way: from the *declarative* half of self-contained version-change modules. We get the same for free once
the `schema` half is populated from day one — which is why the doc insists on populating it even in Phase 1,
long before the Overlay/`/versions` generators are built.

> **So, concretely:** don't invent a bespoke format and don't ship `defineVersionChange` over the wire.
> Generate (a) one OpenAPI 3.1 doc per version and (b) one Overlay 1.0.0 doc per change from the module's
> `schema` half, publish both at stable URLs behind a `/versions` discovery endpoint, and annotate fields
> with `x-since-version` + `Sunset`. All four are standard, tool-supported, and derive from the same single
> source of truth.

---

## Supporting mechanisms

### Tolerant reader on cache hydration

The tolerant reader is the **safety net** that covers the brief gap between a new bundle loading and its
cache-migration pass completing (and any row a migration somehow missed). Run the generated Zod schema on
hydrate: during a rollover window the old field is kept optional so both shapes validate, and a row still
in the old shape is **coerced in memory** via the same `migrateCachedEntity` chain before the UI sees it.
A row that fails even that is evicted + refetched **individually** (never a fleet-wide refetch). It is a
backstop to the [bounded cache migration](#payoff-3--bounded-client-cache-migration-no-herd-no-stale-forever),
not a replacement for it — the on-disk rewrite is what guarantees data doesn't stay stale. `zTask`/`zAttachment`
already exist but are unused on the read path today.

### oasdiff — breaking-change detection in CI

[oasdiff](https://github.com/oasdiff/oasdiff) (Go CLI + GitHub Action) classifies changes between two
OpenAPI specs as breaking vs. non-breaking, with stable change fingerprints. Use it to **gate** every PR:
a breaking change must ship *either* an additive refactor (a version-change module) *or* an explicit
`apiVersion` bump (true protocol break only). This is the deterministic signal we'd otherwise hand-roll.

### Telemetry — "is it safe to contract yet?"

The contract phase needs a runtime answer to *"is any consumer still on the old shape?"* Sources:

- A **server-side `failed_mutations`** dead-letter table (below) — rejection counts per entity/version.
- A per-request version stamp from each consumer (client bundle version / peer `Accept-Version`).

The decision is a **fleet-wide floor**: contract only when the *minimum* active consumer version has passed
the change that introduced the new field.

---

## Backstop: true protocol break → bump `apiVersion`

The only break the version-tolerant boundary cannot absorb is a change to the **envelope itself** — the
`stx`/`ops` wire format, the auth/session contract, the streaming protocol. The whole conversation is
incompatible, so no per-field module can paper over it. For this one case, **bump `apiVersion`**:

- `apiVersion` is baked into the **session cookie name** (`${slug}-session-${apiVersion}`), so bumping it
  **invalidates every existing session** → forces a clean re-auth and a fresh client load. That hard reset
  is *appropriate* here: when the protocol is incompatible you genuinely want everyone off the old one, and
  the cookie-name change gives you that boundary for free.
- It is the right tool precisely because it is heavy: it logs everyone out, so it is reserved for breaks
  where a silent in-place swap is **not** safe. Never reuse it for a routine field change.

### Exactly two leaves

The decision tree has exactly **two leaves**: a **field/shape change → version-change module** (no
interruption), and an **envelope/auth/transport change → `apiVersion` bump** (clean re-auth). There is
deliberately no third "client-data-only" cache wipe — a shape change is absorbed by a module + tolerant
reader, and a wire-serialization change is part of the envelope, so it rides the `apiVersion` bump.

**Guardrails on an `apiVersion` bump, driven by the exam constraint:**

1. **Defer, never interrupt mid-task.** A bump logs everyone out; gate the forced re-auth behind a "safe to
   interrupt" check (idle / between sessions), never mid-exam.
2. **Thundering herd is real.** A synchronized re-auth + cold client load = every client refetching at once
   just as pods restart and the TTL cache is empty. For 300–1000 concurrent users that is a latency spike at
   the worst moment. Mitigate with **client jitter**, **lazy/throttled refetch**, and **TTL-cache pre-warm**.
3. **Rescue pending mutations first.** Mutations authored under the old `apiVersion` must be quarantined
   (below) before the reset — never silently auto-replayed across a version boundary.

> The whole point of the version-tolerant boundary is to make this backstop fire **almost never** — it
> trades availability for correctness, which the exam context can't routinely afford.

---

## Pending-mutation rescue

Whenever a mutation cannot be safely applied (an `apiVersion` boundary or an un-tolerable break), **never
silently drop it.**

- **Client `failed_sync` (Dexie table)** — survives the reset; holds the dehydrated mutation (`ops`,
  `stx`, authored `apiVersion`, reason). Non-blocking banner + **JSON export**. The **only** store that can
  hold *purely-offline, never-pushed* edits.
- **Server `failed_mutations` (Postgres, optional)** — the Dead Letter Queue / rejected-command pattern.
  A mutation rejected at the version gate is persisted instead of just erroring. Complements (does not
  replace) the client table.

| | Client `failed_sync` | Server `failed_mutations` |
|---|---|---|
| Survives client reset | Yes | Yes |
| Survives device loss / reinstall | No | **Yes** |
| Cross-device | No | Yes |
| Holds never-pushed offline edits | **Yes** | No |

The server table's strongest justification is **observability** — it answers "is it safe to contract yet?"
and turns silent loss into an alertable signal. Both are quarantines: **never auto-applied**, replayed only
after deterministic migration or human-confirmed repair, idempotent via `stx.mutationId`.

### Optional (Phase 2+): AI-assisted recovery

For quarantined mutations that are *semantically* recoverable but not deterministically mappable, an LLM in
the existing `ai/` workspace can **propose** a new-shape mutation from `{ oldSchema, newSchema, rawOps }`.
Hard rules: **propose, never auto-commit** (re-enters the normal pipeline, validated against the current
Zod contract, human-confirmed); **off the critical path** (a user-initiated "recover my changes" flow);
**never replaces** the deterministic layers.

---

## Version skew & PWA delivery

Everything above is one instance of **version skew**: during/after a deploy, mismatched consumer/server
versions coexist (old client → new API, *and* new client → old API). The "client arrives 1 vs 10 minutes
later" risk is the **staleness window**. For an installed PWA the window can be **weeks** — you cannot
assume the client ever updates on your schedule — which is what makes the version-tolerant boundary
non-optional rather than nice-to-have.

| Layer | Concern | Mechanism |
|-------|---------|-----------|
| 1 — harmless skew | Old & new shapes both valid | Version-change modules + client cache migration + tolerant reader + **N-1 backend window** (every release accepts the previous consumer version for ≥1 rollover) |
| 2 — eliminate skew | Pin consumer to its build | `apiVersion` / `426 Upgrade Required` (backstop only; cf. Vercel Skew Protection) |
| 3 — Vite chunk 404 | Hashed chunk gone after deploy | `vite:preloadError` reload guard + **retain old assets** for an overlap window |
| 4 — PWA delivery | SW serves stale code/cache | `injectManifest` + **prompt** flow (current) + periodic `registration.update()` |

Notes on Layer 3/4 specific to this repo:

- **Vite chunk 404** is the classic SPA deploy bug: a stale tab lazy-imports `Page.abc123.js` that no
  longer exists → white screen. Handle `vite:preloadError` (reload with a loop guard) and keep the last N
  builds' chunks live.
- **PWA is better *and* worse.** Workbox `precacheAndRoute` precaches chunks atomically, so a PWA largely
  *avoids* the chunk-404 problem a plain SPA hits. But `autoUpdate` (`skipWaiting`) can swap the precache
  under a running client = subtle corruption; the **prompt** flow already used in
  [frontend/src/modules/common/reload-prompt.tsx](../frontend/src/modules/common/reload-prompt.tsx) (with
  custom [frontend/src/sw.ts](../frontend/src/sw.ts)) is the correct, safer choice. A slow connection can
  leave a client on old code for minutes-to-weeks, survivable **only** because of the Layer 1 N-1 window.

---

## Strategy comparison

| | Version-tolerant boundary (primary) | `apiVersion` reset (backstop) |
|---|---|---|
| User interruption | **None** | Deferred to idle only |
| Thundering herd | **None** (cache migrates locally) | Mitigated (jitter/throttle/pre-warm) |
| Stale cache on disk | **Migrated within a deploy cycle** | Wiped + reloaded |
| Cache after change | **Stays warm** | Cold (re-auth + reload) |
| Offline edits across change | Preserved (upgraded) | Export-only rescue |
| Fork interoperability | **Yes** (same modules) | No |
| Implementation cost | Low–medium (discipline + modules) | Low (reuses existing `apiVersion`) |
| Correctness risk | **Very low** | Low |

---

## Recommended approach

1. **Version-tolerant boundary by default** — expand/contract + Cadwyn-style runtime modules; breaking
   changes become additive deploys; caches never bust and offline edits never break.
2. **Client cache-migration pass** — on new-bundle boot, replay missing modules' `migrateCachedEntity` over
   IndexedDB (local, no refetch), advance the cache pointer; bounded by a staleness deadline so no row
   stays stale beyond a deploy cycle.
3. **Tolerant reader on hydration** — in-memory safety net covering the gap before the migration pass runs.
4. **oasdiff in CI** — deterministic breaking-change gate forcing a module or an explicit `apiVersion` bump.
5. **Telemetry-driven contract** — fleet-floor signal (cache pointer + `failed_mutations` + version stamps)
   decides when every client has crossed a module and the field can be dropped.
6. **Single backstop** — a true envelope/auth/transport break bumps `apiVersion` (re-auth + clean slate via
   the session-cookie name). Never mid-task; jitter + throttled refetch + TTL pre-warm.
7. **Pending-mutation rescue** — client `failed_sync` (primary) + optional server `failed_mutations`.
8. **Build toward the fork mesh** — multi-version spec generation + published Overlays + fork negotiation
   are committed roadmap phases; populate each module's `schema` half from the start so they need no rework.
9. **AI-assisted recovery (Phase 2+)** — propose-and-validate, human-confirmed, off the critical path.

---

## Open questions

1. **Module shape** — finalize the `defineVersionChange` API (runtime + cache-migration + schema halves) and
   how the shared module is published to both the backend and frontend bundles.
2. **Cache pointer & migration pass** — where the pointer lives (Dexie meta row vs. the existing `buster`
   slot), how `migrateCachedEntity` is applied across Dexie tables, transactionality, and crash-resume of a
   partial pass. **Reframe per Jazz:** decide rewrite-on-boot vs. **translate-on-read** (Jazz composes
   lenses on read and never rewrites disk, which deletes the pointer/transactionality/crash-resume problem).
   Leaning toward the hybrid — translate-on-read as the correctness floor, boot rewrite as optional
   compaction.
3. **Staleness deadline** — what bundle age forces an update before continuing, and how it interacts with
   the PWA prompt + N-1 window so the "migrate within a week/month" ceiling is actually enforced.
4. **Tolerant-reader scope** — Zod coercion on all product-entity hydration, or only during declared
   rollover windows?
5. **"Safe to contract" threshold** — what cache-pointer fleet-floor + time-window declares a field dead?
6. **oasdiff integration** — wire into the existing `diffHash` / `openapi.manifest.json` pipeline, or run
   standalone? Where is the additive/breaking verdict recorded?
7. **Reload-loop breaker** — the forced re-auth/reload after an `apiVersion` bump must fetch the new bundle
   with a circuit breaker (after N failed upgrades → quarantine + stop).
8. **Fork negotiation protocol** — `Accept-Version` semantics, shared-core contract definition, and how
   divergent entity models are advertised between peers. **Consider content-hash addressing (Jazz):** peers
   exchange fork-independent schema *hashes* and negotiate "is there a lens path between hash X and Y?"
   rather than comparing fork-local date ordinals/integers, which are incomparable across divergent forks.
9. **Overlay/version publication** — where per-version specs + Overlays are hosted, and the `/versions`
   discovery endpoint's auth model for peer forks.

---

## Suggested build order

1. **Runtime module pattern** — `version-changes/` directory + `defineVersionChange` + request
   up-migration before validation + response down-migration. Pays for itself on the sync engine alone.
2. **Client cache-migration pass** — cache pointer + boot-time replay of `migrateCachedEntity` over Dexie
   (local, no refetch) + staleness deadline. This is what bounds "migrate within a week/month."
3. **oasdiff in CI** — additive/breaking verdict per PR, wired to
   [generate-openapi.ts](../backend/scripts/generate-openapi.ts) / `openapi.manifest.json`.
4. **Tolerant-reader** hydration for product-entity queries (in-memory coerce via the same chain +
   per-record evict-on-fail) as the safety net.
5. **Telemetry** — cache-pointer + `failed_mutations` + version stamping → fleet-floor query.
6. **`apiVersion` backstop** — idle-gated forced re-auth/reload for true protocol breaks, with jitter /
   throttled refetch / TTL pre-warm / reload-loop breaker.
7. **Client `failed_sync`** rescue + JSON export.
8. **Phase 2/3:** multi-version spec generation + published Overlays + fork negotiation (the committed
   mesh target).
9. **AI-assisted recovery (Phase 2+).**

---

## Cross-comparison: the local-first / schema-evolution landscape

No single existing tool spans the three layers this doc has to cover at once — **(A) API wire
interoperability** between independently-deployed peers, **(B) server DB schema migration**, and **(C)
client offline-cache migration**. The API-versioning camp (Cadwyn, Stripe) owns the wire and ignores
storage; the local-first sync-DB camp (RxDB, WatermelonDB, Dexie) owns client storage and ignores the
wire; the migration camp (Drizzle, Rails) owns the server DB. The novelty of this design is using **one
frozen, ordered transform** across all three. The matrices below place each strategy on those axes.

> **Verified against vendor docs, June 2026.** The local-first space moves fast and several of these
> projects are pre-1.0; rows are dated to the docs read (Zero schema-changes guide, **Jazz 2.0 alpha** —
> the Rust-core rewrite at [garden-co/jazz](https://github.com/garden-co/jazz), *not* Classic Jazz's older
> TS CoValue model — LiveStore 0.3.1, RxDB, PowerSync, TinyBase 8.4, Electric's pivot to read-path shape
> sync). Treat the fast-movers as "true as of now," not durable fact.
>
> **Legend:** ✅ directly addresses · ◑ partial / possible but not native / needs re-sync / lossy · — does not address.

### Matrix A — which layer does each strategy cover?

| Strategy | A. API wire interop (independent deploy) | B. Server DB migration | C. Client offline-cache migration |
|---|---|---|---|
| **This doc** (version-change modules) | ✅ up/down at edge + negotiation | ◑ rides Drizzle expand/contract | ✅ replay `migrateCachedEntity` over IndexedDB |
| **Jazz 2.0** (Rust core + TS DSL, local-first relational DB) | ◑ own sync protocol, not OpenAPI | ✅ relational, RocksDB server | ✅ **hash-addressed bidirectional lenses, no rewrite** |
| **Cadwyn** (FastAPI) | ✅ multi-version replay | — | — |
| **Stripe** versioning | ✅ server-side transformers | — | — |
| **Confluent Schema Registry** (Avro/Protobuf) | ✅ compat-checked + reader/writer resolution | — | — |
| **GraphQL** (additive + `@deprecated`) | ◑ tolerance via field selection | — | — |
| **Cambria** (Ink & Switch lenses) | ◑ general JSON Patch, not API-bound (cambria-express exists) | — | ✅ purpose-built; **patch-lenses + lens graph + translate-on-read** |
| **panproto** | ◑ derive/consume Overlays | ◑ | ◑ engine, not a runtime |
| **CRDT** (Automerge, Yjs) | — | — | ◑ structural tolerance, no schema |
| **RxDB** `migrationStrategies` | — | — | ✅ per-collection version (also migrates replication state) |
| **WatermelonDB** migrations | — | — | ✅ local SQLite |
| **LiveStore** (event-sourced) | — | ◑ re-materialize from events | ✅ rebuild read-model from event log (+ event backwards-compat) |
| **TinyBase** (schema coerce) | — | — | ◑ coercion + defaults only, **lossy** (drops non-conforming cells/rows), no versioned migration |
| **Dexie** `version().upgrade()` (current Cella) | — | — | ◑ table *layout* only, not row shape |
| **Drizzle / Rails / strong_migrations** | — | ✅ expand/contract | — |
| **ElectricSQL** (post-pivot: read-path shapes) | — | ✅ plain Postgres DDL | ◑ client receives new shape; no local write-migration |
| **Zero** (Rocicorp) | ◑ expand/contract by **deploy ordering**, not independent deploy | ✅ Postgres | ◑ incompatible client → `onUpdateNeeded`/reload |
| **Replicache** | ◑ schema-version bump | app-defined | — bump forces full re-sync |
| **PowerSync** | ◑ sync rules | ✅ | ◑ redefine local schema + re-sync |
| **Realm / Atlas Device Sync** | ◑ additive changes sync | ✅ | ◑ breaking change → client reset |

### Matrix B — how does the transform work?

| Strategy | Direction | Lossless reverse | Transform authoring | Maintain-latest-only |
|---|---|---|---|---|
| **This doc** | bidirectional | ◑ manual downgrade | hand-written, frozen, ordered | ✅ |
| **Jazz 2.0** | **bidirectional** | ◑ `backwardsDefault` | **declarative diff** (`add`/`drop`/rename), **draft-on-ambiguity** (Rust core) | ✅ hash-addressed versions |
| **Cadwyn** | bidirectional | ◑ manual | hand-written modules | ✅ |
| **Stripe** | down-only (toward old clients) | ◑ manual | hand-written transformers | ✅ |
| **Cambria** | bidirectional (**on patches/ops**) | ◑ best-effort (`convert`/scalar↔array break lens laws) | hand-written declarative lens ops; **graph, not linear** | ✅ (one lens → 3 artifacts) |
| **panproto** | bidirectional | ◑→✅ via explicit complement | **auto-derived** (+ propose on ambiguity) | ✅ via schema VCS |
| **Confluent SR** | reader/writer resolution | n/a (tolerance) | declarative schema + compat rules | ◑ per-subject |
| **GraphQL** | n/a (tolerance) | n/a | none — additive only | ✅ |
| **CRDT** (Automerge/Yjs) | n/a | n/a | none — schemaless tolerance | n/a |
| **RxDB** | up-only | — | hand-written per version | ✅ version number |
| **WatermelonDB** | up-only | — | hand-written SQL steps | ✅ |
| **LiveStore** | event-replay / re-materialize | n/a | backwards-compat events + materializers | ✅ (event log is the truth) |
| **TinyBase** | coerce-on-apply | — (lossy) | declarative schema + defaults | n/a |
| **Dexie** | up-only | — | hand-written upgrade fn | ✅ |
| **Zero** | deploy-ordered + DB triggers | — | manual SQL (dual-column + trigger) | ◑ |
| **Drizzle / Rails** | up-only (down rare) | — | hand-written SQL | ◑ |
| **ElectricSQL** | re-sync (read-path) | — | plain Postgres DDL | ✅ |
| **PowerSync** | re-sync | — | sync rules | ✅ |

### What the landscape tells us

- **The three layers are usually solved in isolation.** Only this design, **Jazz**, and (at the engine
  level) Cambria/panproto treat *one* transform as serving more than one layer. That unification is the
  load-bearing idea, not any single layer's mechanism.
- **Three philosophies for "an old shape arrives," not two.**
  - *Tolerance* — never transform, just accept: Confluent reader/writer resolution, GraphQL additive-only,
    CRDT schemalessness. Cheap, but can't express a true rename or a lossless downgrade.
  - *Transformation* — actively migrate between shapes: us, Jazz, Cadwyn, Stripe, Cambria, panproto, the
    offline DBs (RxDB/Watermelon/Dexie), LiveStore-via-events. This is where a rename + downgrade actually
    works.
  - *Reset / re-sync* — treat the client store as a **disposable replica** and reload or re-pull on any
    incompatible change: **Zero** (`onUpdateNeeded`→reload), ElectricSQL, PowerSync, Replicache, Realm/Atlas.
    This is the **default of most turnkey sync stacks**, and it is exactly the interruption / thundering-herd
    outcome the exam constraint rules out.
  We deliberately sit in **transformation**, because availability under version skew is a hard requirement.
- **Closest prior art is Jazz — strikingly so.** Jazz's new migration model is, independently, almost this
  document's design: hash-addressed schema versions, a **declarative diff that runs in both directions**,
  `backwardsDefault` to feed dropped fields to older clients (our `downgradeResponse` dual-emit), and
  **draft lenses that fail until a human resolves an ambiguous rename** (our "propose, never auto-commit").
  The differences are the parts Jazz *doesn't* do: it's bound to its own sync protocol (not OpenAPI / fork
  interop over HTTP), and it has no concept of publishing per-version OpenAPI specs or Overlays for a *peer
  fork that never runs our code*. So Jazz validates the cache-migration half of this design and is the
  reference to study; our Phase 2/3 wire-interop story is the part it doesn't address.
  > **Which Jazz:** this is **Jazz 2.0** (garden-co/jazz, ~64% Rust: a Rust core compiled to wasm/napi/rn
  > with a TypeScript schema DSL, billed as a local-first *relational* database), **not** the older Classic
  > Jazz CoValue/CRDT TypeScript library. The lens engine runs in the Rust core. Its own README warns LLMs
  > to read the docs rather than trust corpus knowledge — i.e. the pre-2.0 CRDT framing is stale.
- **Bidirectional is rarer than up-only.** Most offline DBs (RxDB, Watermelon, Dexie) are **up-only** —
  great for "migrate my cache forward," useless for "speak last-month's contract back to a peer." Only the
  lens family (Jazz, Cambria, panproto, us) does both directions; none of them is *provably* lossless by
  default — panproto's explicit `complement` is the one mechanism that makes the reverse formally lossless,
  which is why it's worth borrowing.
- **Auto-derived vs. hand-written is the live tradeoff.** Everything we'd ship is hand-written and frozen
  (auditability); Jazz auto-generates the diff stub but makes you review it; panproto fully auto-derives —
  which is why it's framed below as a *build-time calculator* and propose-only recovery aid, not a runtime
  dependency.

---

## Related work: Cambria (the closest conceptual fit) — a deep assessment

[Cambria](https://www.inkandswitch.com/cambria/) (Ink & Switch, Litt/van Hardenberg/Henry, Oct 2020;
[inkandswitch/cambria](https://github.com/inkandswitch/cambria), TypeScript) is, on close reading, the
**closest conceptual ancestor to this entire document** — closer than Jazz or Cadwyn. It is a research
prototype, not a product, but the *ideas* map onto our problem almost one-for-one, and three of them are
things our current design only half-states. It is also the cited lineage for both Jazz's and panproto's
lens models, so understanding Cambria explains the whole family.

### How Cambria actually works

- **A lens is a single bidirectional spec built from small operators** — `rename`, `add`, `remove`,
  `convert` (value mapping), `wrap`/`head` (scalar↔array), `hoist` (flatten nested), `in`/`map` (descend
  into a field/array). You write the change *once*; the same declaration runs **forward and backward**. A
  `rename: { source: name, destination: title }` automatically knows how to go both ways.
- **Lenses form a *graph*, not a linear chain.** Each **node is a schema**, each **edge is a lens**. To
  translate between any two schemas, Cambria **routes data through the shortest path in the graph**. This is
  the crucial structural difference from Stripe (which uses dates → a single linear path) and is explicitly
  motivated by branches and decentralized forks: *"data schemas aren't linear, even in centralized
  software."*
- **It transforms *patches/ops*, not whole documents.** Under the hood Cambria operates on **JSON Patch**
  operations and evolves *those* between schemas (built directly on Hofmann/Pierce/Wagner **"Edit Lenses"**).
  A patch `{ op: replace, path: /assignee, value: Alice }` becomes `{ op: replace, path: /assignees/0,
  value: Alice }` through the scalar→array lens. A document is just the special case of a patch containing
  the whole document.
- **One lens spec emits three artifacts** — *"lens once, use everywhere"*: (1) the **runtime** patch
  converter, (2) updated **TypeScript types**, (3) a **JSON Schema** validator for runtime checking. All
  three are generated from the *same* lens, so they can't drift.
- **Translate on read, never on write** (their single most important finding). Their first prototypes
  translated at *write* time and it broke the moment a new schema was registered after a write. They
  switched to: **store the raw write in the writer's schema, tag the op with that schema, and translate
  lazily on read** through whatever lens path the reader needs. This makes old writes **future-proof** —
  *"old changes can be evolved using lenses that didn't even exist at the time of the original change."*
- **Lenses travel with the data.** In the Automerge integration, the lens source is written *into the
  document* so an old client can fetch a newer lens it doesn't ship and still read newer writes. (For us the
  analogue is publishing lenses at a well-known URL / in the shared bundle — see Phase 3 Overlays.)
- **It is honest about where lenses stop being lenses.** `convert` (arbitrary value maps) and lossy
  reshapes **don't satisfy the formal lens laws** — Cambria allows them but flags that they can't guarantee
  a consistency relation. "Augmenting data" (the reverse of object→ID, where old clients need *real* data
  not a placeholder) is **unsupported** — it needs an external lookup the lens system can't express.
  Scalar↔array deletion has no perfect reverse (the consistency / conservation / predictability trilemma,
  Appendix III). These are exactly the edges our `◑ manual downgrade` honesty is gesturing at.

### Why it fits this doc better than Jazz or Cadwyn

| Our concept | Cambria equivalent | Fit |
|---|---|---|
| `upgradeRequest` / `downgradeResponse` operate on **`ops`** | Cambria **evolves JSON Patches**, not documents | **Near-exact.** Our wire payload *is* a patch/op stream. Cambria is the only system in this survey whose primitive is the same shape as our mutation contract — a much tighter match than Jazz's row/covalue model. |
| `migrateCachedEntity` over IndexedDB | same lens run over stored data | **Exact** — same transform, two call sites, which is our whole thesis. |
| The fork mesh, divergent entity models (Phase 3) | **lens graph + shortest-path routing** | **Exact and better-formed than our draft.** Date ordinals force a line; a graph models *branches* — two forks are two nodes, a connecting lens is an edge. This is the right data structure for "peers have different entity models," which our doc currently hand-waves. |
| Three module halves (runtime / schema / cache) from one source | **three artifacts** (runtime / TS types / JSON Schema) from one lens | **Near-exact** — same "single source of truth → many generated outputs" principle, and validates our insistence on generating, not hand-writing, the secondary artifacts. |
| Translate-on-read synthesis (from the Jazz section) | Cambria's **central finding**, with the failure mode spelled out | **Confirms it.** Two independent local-first teams (Ink & Switch, then Jazz) converged on read-time translation after write-time translation failed. Strong signal we should adopt it as the floor. |
| oasdiff breaking/non-breaking gate | JSON Schema artifact + lens laws | Partial — Cambria checks *lens* validity, not OpenAPI breaking-ness; we still need oasdiff at the HTTP layer. |

### What to take, and the honest caveats

**Take the ideas, not the dependency.** Cambria is a 2020 research prototype
([cambria](https://github.com/inkandswitch/cambria), [cambria-automerge](https://github.com/inkandswitch/cambria-project),
[cambria-express](https://github.com/inkandswitch/cambria-express)), effectively unmaintained, performance
never formally measured, and tightly bound to Automerge in its only real integration. The browser
cache-migration path is the hot offline loop — same rule as panproto: **vendor the concepts, don't take the
runtime.** Specifically worth lifting:

1. **The op/patch-lens framing** as the formal model for `upgradeRequest`/`downgradeResponse` — because our
   mutations already *are* patches, this is the most natural fit of any prior art here. The lens laws give a
   CI invariant (round-trip a patch through up∘down and assert identity for the lossless operators).
2. **The lens *graph*** as the Phase-3 negotiation structure: schemas are nodes, version-changes are edges,
   `Accept-Version` negotiation becomes **shortest-path between two schema nodes** — which subsumes both the
   linear first-party chain *and* divergent fork branches in one model. (This is the structural upgrade the
   panproto "structural schema VCS" thread was also reaching for.)
3. **The operator vocabulary** (`rename`/`convert`/`wrap`/`head`/`hoist`/`in`/`map`) as a ready-made,
   battle-tested superset of our `ops.ts` primitives — and the explicit catalogue of which ones are *true*
   lenses vs. lossy (`convert`, scalar↔array) tells us exactly where to require a hand-written downgrade and
   a `failed_sync` fallback.
4. **"Augmenting data" as a named, unsolved boundary.** Cambria's honest admission that object→ID reverse
   needs an external lookup is precisely our "required field / reference can't be invented locally" case — it
   confirms that class of change must route to the AI-recovery / human-confirm channel, never an auto-lens.

**Where Cambria stops and we still need the rest of this doc.** It has **no OpenAPI/Overlay awareness** (it
operates on JSON Schema and JSON Patch, not OpenAPI specs), **no version-negotiation protocol** over HTTP,
and **no notion of publishing per-version specs for a peer that never runs our code**. So Cambria informs
the *transform/cache* core (Phases 1 and the graph shape of 3), while Cadwyn/Stripe (spec-per-version) and
the Overlay/`/versions` machinery remain ours to build on top.

> **Net assessment:** Cambria is the **conceptual blueprint** for the transform layer of this design —
> patch-lenses, a lens graph, translate-on-read, one-source-many-artifacts. Jazz proves those ideas survive
> contact with a shipping product; panproto adds the formal losslessness (`complement`) and protocol-aware
> classification Cambria lacked. The right move is to **adopt Cambria's model as the mental model**, borrow
> panproto's `complement` for provable reversibility, and keep our OpenAPI/Overlay/negotiation layer as the
> part none of the three address.

---

## Related work: Jazz 2.0's lens model (what to borrow)

[Jazz 2.0](https://jazz.tools/docs/schemas/migrations) (garden-co/jazz, Rust core + TS DSL) is the closest
working system to this doc's *cache-migration* half, and its migration design makes several choices that
differ from ours in instructive ways. Reading its live docs closely, here is exactly how its lenses work
and what is worth stealing.

### How a Jazz lens actually works

- **Every distinct `schema.ts` is content-hashed** (`a01f5c72ec47`, `311995e9a178`, …). A schema version
  *is* its hash — identity is the content, not a date or an incrementing integer. `schema hash` computes it
  offline without contacting a server.
- **A lens is the declarative diff between two hashes**, authored in one file keyed by `fromHash → toHash`:

  ```ts
  // migrations/20260318-add-description-a01f5c…-311995…ts
  export default s.defineMigration({
    migrate: { todos: { description: s.add.string({ default: 'No description' }) } },
    fromHash: 'a01f5c72ec47',
    toHash:   '311995e9a178',
    from: { todos: s.table({ title: s.string(), done: s.boolean(), /* …full prior schema… */ }) },
    to:   { todos: s.table({ title: s.string(), done: s.boolean(), description: s.string().optional() }) },
  });
  ```

- **One declarative op carries *both* directions.** `s.add.string({ default })` means "forward: add with
  this default; reverse: drop it." `s.drop.int({ backwardsDefault: 0 })` means "forward: drop; reverse:
  re-supply `0` so an older client still sees the column." The docs are explicit: *"the declarative
  operations carry enough information to run in either direction… the same operations replay in reverse."*
  There is **no second hand-written function** for the downgrade path — the engine derives it.
- **Storage is partitioned by schema hash; nothing on disk is ever rewritten.** Rows written under a schema
  live in that schema's branch (`env-{hash}-userBranch`) and **stay there unchanged**. A reader on schema
  v3 loading a v1 row **composes the lens chain v1→v2→v3 on read** to interpret it. Non-adjacent reads
  compose intermediate lenses in sequence. Shipping a new schema rewrites nothing.
- **Ambiguity → draft lens that fails loudly.** If the diff is ambiguous (a column dropped *and* a
  same-typed column added = possible rename), the generated lens is marked a **draft**, and *"draft lenses
  will fail at startup if they are in the path to a live schema"* until a human resolves the rename.
- **Lazy / historical migrations.** You needn't write a migration for every change; unbridged rows simply
  sit in the DB **unreadable across versions** until a lens exists, and the server *detects unreachable rows
  and warns*. Migrations for old hashes can be authored after the fact with explicit `--fromHash/--toHash`.

### What to borrow (and what to keep)

| Jazz mechanic | Our current design | Verdict |
|---|---|---|
| **Translate-on-read**, storage partitioned by schema-hash branch, **nothing rewritten** | Migrate-on-boot: rewrite IndexedDB rows in place, advance a cache pointer | **Borrow as an option.** Read-time lens composition **sidesteps our Open Question #2 entirely** (no pointer, no transactional pass, no crash-resume of a partial rewrite). Cost moves from one boot-time pass to every read. A **hybrid** is attractive: tolerant-read composes lenses on hydrate (always correct, zero migration state), and the boot pass becomes an *optional* compaction, not a correctness requirement. |
| **One declarative op = both directions** (`add{default}` / `drop{backwardsDefault}`) | Three separate functions (`upgradeRequest` / `downgradeResponse` / `migrateCachedEntity`) that can drift; CI cross-checks them | **Borrow.** Make the declarative `schema` half **primary** and **derive** the imperative transforms for the common cases (`rename`/`add`/`drop`/`retype`) — exactly what our `ops.ts` primitives hint at. Hand-write only `custom`. Eliminates the drift class by construction instead of policing it in CI. |
| **Whole-schema content-hash addressing** | Date-ordinal filenames / monotonic version integer | **Borrow for the mesh (Phase 3).** Date ordinals are fork-local and meaningless across divergent forks; a **content hash is fork-independent** — two forks that arrive at the same shape get the same hash, and negotiation becomes *"do we share a lens path between hash X and hash Y?"* rather than comparing incomparable version numbers. This is a better `Accept-Version` primitive for peers than an integer. Keep date-ordinals for the *first-party* linear chain; add hashes for *cross-fork* identity. |
| **Self-contained `from`/`to` snapshots embedded in each migration** | Modules carry only the delta; spec-gen reconstructs `v(n-1)` by replaying the chain | **Borrow.** Snapshotting the resolved schema at each version makes each module independently verifiable (validate the lens against the exact frozen schemas it bridges) and removes the "reconstruct the old shape by replaying everything" fragility. Aligns with our per-version OpenAPI emit — store the snapshot next to the module. |
| **Draft-on-ambiguity gated by "path to a live schema"** | "Propose, never auto-commit"; AI-recovery proposes | **Already aligned — sharpen it.** Jazz's refinement is the *"path to a live schema"* gate: a draft only **blocks** if it lies on a path to a currently-served version. That maps onto our **N-1 window** — the set of still-supported consumer versions defines exactly which lens edges *must* be non-draft. Adopt that as the precise rule for "which ambiguous changes block a deploy." |
| **Lazy migration + unreachable-row detection** | Eager: every breaking change ships its module | **Borrow the safety net, not the laziness.** We want eager modules, but Jazz's *"detect rows not reachable from the current schema and warn"* is a good CI/runtime guard: assert no persisted cache row (or peer payload) sits at a hash with no lens path to a live version. |

### The one real philosophical fork: rewrite vs. translate-on-read

This is the decision Jazz makes differently and the most important thing to learn from. Our doc currently
commits to **rewriting** the IndexedDB cache on boot (Payoff 3). Jazz **never rewrites** — it keeps every
version on disk and composes lenses at read time. The trade:

- **Translate-on-read (Jazz):** zero migration state, no pointer, no partial-pass crash recovery, instantly
  correct for *any* stored version; but pays lens-composition cost on every read and lets stale shapes
  linger on disk indefinitely.
- **Migrate-on-boot (ours):** one bounded pass, then reads are free and on-disk shape is uniform (good for
  the "no row stays stale" exam constraint); but needs the pointer, transactionality, and crash-resume that
  Open Question #2 is still wrestling with.

**The synthesis worth adopting:** use **translate-on-read as the always-correct floor** (it makes the
tolerant reader *the* mechanism, not a fallback, and deletes a whole class of migration-state bugs), and
treat the **boot-time rewrite as an opportunistic compaction** that bounds on-disk staleness for the exam
requirement — not as the thing correctness depends on. That gives Jazz's robustness *and* our bounded-
staleness guarantee, and collapses Open Questions #2 and #4 into one mechanism (the lens chain) run in two
places (hydrate + optional compaction).

---

## Related work: panproto (delta calculation for Overlays)

[panproto](https://github.com/panproto/panproto) (Rust workspace, MIT, single-author, ~v0.51, pre-1.0)
is the closest external project to the *delta* layer of this design — and it speaks directly to the
idea of **using a structural diff engine to *calculate* the version change rather than hand-authoring it.**
It models every schema language (it lists ~50: OpenAPI, AsyncAPI, JSON Schema, Protobuf, ATProto
lexicons, …) as a graph/GAT, then runs a pipeline of: **diff two schemas → classify the change
(protocol-aware, not just structural) → emit a bidirectional *lens* (`get`/`put` + a `complement` that
captures the discarded information so the reverse direction is lossless) → version it in a git-style
schema VCS (structural pushout merge).** It ships a WASM `@panproto/core` plus Python/Rust SDKs, and an
`exploratory` stringency mode (`coerce_proposals`) that *proposes* mappings for ambiguous diffs instead of
guessing.

**Why it's relevant to the Overlay question specifically.** Our Phase 3 publishes an
[OpenAPI Overlay 1.0.0](https://spec.openapis.org/overlay/v1.0.0.html) per change, today projected from the
hand-written `schema` half of each `defineVersionChange` module. panproto is, in effect, a generic engine
for computing that projection: feed it `v(n-1)` and `v(n)` OpenAPI docs and it derives the structural delta
*and* a reverse transform. So there are two concrete ways it could plug in:

- **Produce Overlays.** Use panproto's diff/classify to *calculate* the `update`/`remove` action list
  (the Overlay body) from two resolved specs — a more formal, protocol-aware alternative to projecting
  from our own declarative `schema` half (or to diffing with plain oasdiff and translating by hand).
- **Consume Overlays.** Because panproto reasons about Overlay-shaped deltas as lenses, a *peer* fork's
  published Overlay could be replayed onto *our* divergent base schema (the "replay changes onto your own
  base" property Overlays are designed for), with the lens giving a checked, reversible mapping rather than
  a one-way patch.

**The conceptual mapping to our design:**

| This doc | panproto analogue |
|---|---|
| `upgradeRequest` / `downgradeResponse` pair | a **lens** `get`/`put` — but with an explicit **`complement`**, so the downgrade direction is provably lossless (a plain Overlay patch is one-way) |
| oasdiff breaking/non-breaking gate | **protocol-aware classification** (encodes intent per protocol, not just "a field moved") |
| frozen, ordered, append-only modules | **lens composition** over a **structural schema VCS** (`panproto-vcs`) |
| AI-assisted recovery (propose, don't auto-commit) | `coerce_proposals` under `stringency = exploratory` — same propose-don't-guess shape |

**The tension, and why it doesn't refute our stance.** panproto **auto-derives** the lens from a diff —
the "granular auto-derivation" this doc deliberately rejected in favour of a human-written, frozen
transform. But panproto mitigates exactly the way we'd want: its **protocol theories** let a human encode
intent so the diff isn't blind, and **stringency/`coerce_proposals`** *propose* a mapping for the ambiguous
cases instead of silently committing one. That validates our "human owns the frozen transform; the engine
proposes, never auto-commits" position rather than contradicting it — and it's the natural home for the
Phase-2+ AI-recovery channel.

**Caveat — borrow concepts, don't take the dependency (yet).** panproto is a large, fast-moving, pre-1.0,
single-author Rust/WASM engine (dozens of releases in a few months). The browser **cache-migration path is
the hot, offline-critical loop** and must not depend on a WASM engine of that maturity. It also **does not
mention OpenAPI Overlay 1.0.0 or Cadwyn anywhere** — it sits one layer lower (schema-as-graph + lenses +
schema VCS), and its cited lineage is Cambria (edit lenses for schema migration) and PRISM
(schema-modification operators), not the API-versioning tools central to this doc. So treat it as
**complementary**, not overlapping.

**Investigation threads (no commitment):**

1. **Lens + complement as the formal model** for the `upgrade`/`downgrade` pair, with the lens law
   (`get ∘ put` round-trips) as a CI invariant guaranteeing lossless downgrade.
2. **panproto as the Overlay calculator** — derive each module's Overlay (and validate it) by diffing
   `v(n-1)`/`v(n)` specs through panproto, as a build-time tool in `generate-openapi.ts`, *not* a runtime dep.
3. **Protocol-aware classification** as a richer breaking-change gate than plain oasdiff.
4. **Structural schema VCS** (pushout merge) as a model for reconciling **divergent fork histories** in the
   mesh — peers don't just have older versions, they have different entity models (the Phase 3 shared-core
   problem).
5. **`coerce_proposals` / stringency** as the concrete shape for the AI-recovery channel.
6. **ATProto lexicon support** as a real-world offline-first / federated precedent worth reading.

**Recommendation.** Don't make the browser cache-migration path depend on `@panproto/core`. Do consider
folding in three ideas at the *spec/delta* layer: (a) **lens-with-complement** for provably-lossless
downgrades, (b) **protocol-aware classification** to sharpen the oasdiff gate, and (c) **structural schema
VCS** for merging divergent fork histories — and, most directly relevant here, evaluate panproto as a
**build-time calculator that emits/consumes OpenAPI Overlays** from two resolved specs. Sharpen the
AI-recovery section with panproto's stringency split (deterministic vs. proposed) regardless.

### panproto vs. Cambria: a functional/technical critique

It's tempting to read panproto as "Cambria, but more" — it is broader, more formal, and more actively
developed. But on a purely functional/technical reading the two projects are **strongest at different
layers**, and panproto's advantages come with real costs. A point-by-point assessment:

| Axis | Cambria | panproto | Who wins, technically |
|---|---|---|---|
| **Formal lens model** | Edit lenses (`get`/`put`); admits operators (`convert`, scalar↔array) that **break** the lens laws and are "best-effort" | `get`/`put` **+ explicit `complement`** that captures discarded data → reverse is **provably lossless** (asymmetric / "very-well-behaved" lens) | **panproto.** The complement is the textbook fix for exactly the round-trip violations Cambria documents as unsolved. Genuinely stronger. |
| **Operates on** | **Edits/patches** (JSON Patch ops) — incremental, CRDT-friendly, runs live | Schemas and value-level lenses; **patch/op-granular runtime evolution is unproven/undocumented** | **Cambria**, for *our* use. Our wire format *is* an op stream; Cambria's primitive matches it. panproto's richness is at the schema layer, not the edit layer the sync engine needs. |
| **Schema-language breadth** | JSON Schema only | ~50 languages (OpenAPI, AsyncAPI, Protobuf, ATProto, …) via a common graph/GAT model | **panproto** on paper — but breadth forces a lowest-common-denominator core; a universal graph risks a **leaky/lossy abstraction** for any one language. Cambria's narrowness is simpler and more predictable. |
| **Authoring model** | **Hand-written** lenses (developer states intent explicitly) | **Auto-derived** from a diff + protocol classification; *proposes* on ambiguity | **Tie / context-dependent.** Auto-derivation cuts toil and keeps artifacts in sync, but **moves intent into a classifier** that can be wrong (drop+add-same-type = rename? split vs. retype?). Hand-authoring is more auditable — which our "frozen, human-owned transform" stance values. Richer ≠ safer. |
| **Composition / multi-version** | Lens **graph**, shortest-path routing between schema nodes | Lens composition **over a structural schema VCS** (pushout merge) | **panproto** for the *fork mesh*. Cambria's graph only *routes*; it has **no merge** for divergent histories. panproto's pushout merge is the one mechanism here that actually models "two forks diverged and must reconcile." But pushout merge is **theoretically elegant, practically unproven** in this domain. |
| **Protocol awareness** | None — intent is encoded by operator choice | **Protocol theories** classify a change's *meaning* per protocol, not just its structure | **panproto.** A richer breaking-change signal than structural diff or oasdiff. Real benefit for the CI gate. |
| **Runtime maturity** | Actually ran a live collaborative app (issue tracker) over Automerge; **proven to move real data between versions** | Pre-1.0, single-author, dozens of churning releases; **no demonstrated end-to-end runtime data-evolution** of the kind Cambria shipped | **Cambria.** It's older and unmaintained, but it *demonstrably evolved live data*. panproto's runtime data story is, as far as the docs show, **aspirational** — it's a schema/lens *calculator*, not a proven data-plane. |
| **Bus factor / stability** | Unmaintained but **stable and finished** (won't move under you) | Single-author, **fast-moving, API-unstable** | Wash — Cambria's risk is *staleness*, panproto's is *churn*. Neither is a safe runtime dependency. |

**The core critique.** panproto's "richer" reputation is **accurate at the schema/spec/VCS layer and
overstated at the data/runtime layer.** Its three genuine technical advances over Cambria are the
**`complement`** (provable losslessness — the single most valuable idea to borrow), **protocol-aware
classification** (a smarter breaking-change gate), and the **structural VCS/pushout merge** (the only real
answer to divergent-fork reconciliation in this whole survey). Those are exactly the things this doc needs
at *build time* and at the *Phase-3 mesh* layer.

But for the part that actually keeps users online — **evolving live mutation/patch streams and the offline
cache** — Cambria is the better-matched and better-proven model: it is **edit/patch-granular** (our `ops`
shape), it **ran real collaborative data**, and its **hand-authored, auditable** lenses fit our "frozen,
human-owned transform" requirement better than panproto's auto-derivation, whose intent-inference is a new
failure surface. panproto is *more capable*; it is not obviously *more correct* for the hot path, and its
generality buys a heavier, less predictable abstraction.

**Net:** borrow panproto's **ideas at the edges** — protocol classification for the oasdiff gate and
pushout-merge *thinking* for fork reconciliation — and keep **Cambria's patch-lens model as the mental model
for the runtime/cache core**. Note `complement` is an *interesting* idea more than a load-bearing one for us:
with a canonical server, the reverse/downgrade problem is solved more cheaply by unknown-field passthrough,
so `complement` only matters in a server-less peer tier we don't have today (see the hands-on findings below).
Use the richer engine where its richness is free (build time, spec/delta calculation); do not let its
generality into the offline-critical loop, where Cambria's narrower, proven, hand-authored model is safer.

---

## Hands-on findings: panproto v0.51 and Cambria, run head-to-head (June 2026)

Both engines were exercised directly against the canonical change this doc keeps using — `task.name → task.title`
**plus a lossy `priority` drop** — modelling exactly the "build step that organizes version changes" use case.
The runs were throwaway (no repo code touched). The two results are almost a mirror image of each other, and
together they turn the critique above from argument into measurement.

### What was actually run

- **panproto** `0.51.0`: Homebrew `schema` CLI + the `@panproto/core` WASM SDK (`diffFull`/`classify`/
  `migration`/`liftJson`/`getJson`/`putJson`, plus `Repository` VCS and `integrate`).
- **Cambria** (npm `cambria`, the 2020 prototype): `applyLensToDoc`, **`applyLensToPatch`**, `reverseLens`,
  the lens-graph trio (`initLensGraph`/`registerLens`/`lensFromTo`), and `schemaForLens`.

### Result matrix

| Capability tested | panproto v0.51 | Cambria | Takeaway |
|---|---|---|---|
| **Ingest the repo's real OpenAPI** (`backend/openapi.cache.json`) | ❌ no importer — CLI wants its own graph JSON (`missing field 'protocol'`/`'id'`); SDK schemas are opaque WASM handles (`JSON.stringify → {}`) | n/a (operates on JSON Schema + JSON Patch) | panproto needs an OpenAPI→graph compiler **you'd have to write**; neither speaks OpenAPI natively |
| **Rename as a first-class, intent-preserving op** | ◑ classifier sees `RemovedVertex name + AddedVertex title` → `isBreaking: true` (intent must be re-declared by hand) | ✅ `renameProperty('name','title')` → `{title}` only, no remove+add | Cambria preserves rename intent; panproto's auto-diff is blind to it |
| **Evolve an `ops`-shaped *patch*** (`{op:'replace',path:'/name'}`) | ◑ not demonstrated — runtime works on whole instances/records | ✅ `applyLensToPatch` re-pathed `/name → /title` | **The headline fit.** Cambria's primitive *is* the mutation patch; this is the exact match to the repo's wire format |
| **Lossless reverse across the `priority` drop** | ✅ `complement` (opaque msgpack blob) restored `name`+`done`+**`priority:5`** → round-trip `true` | ❌ `reverseLens` auto-derives, but refills the dropped scalar with the **type default `0`**, not `5` | **panproto's one technical win — but see the reality check below.** It's only decisive in a server-less topology where a narrower peer is also the persistence authority; with a canonical server, unknown-field passthrough covers it more cheaply |
| **Translate-on-read with a lens authored *after* the write** | (no equivalent surface) | ✅ a persisted v1 doc reads correctly through a lens that didn't exist at write time | Cambria's central finding, reproduced — supports the tolerant-reader floor |
| **Cross-fork routing / mesh (Phase 3)** | ❌ blocked three ways: SDK `commit()` fails (`head=None`), `add()` doesn't change status, native CLI format undocumented, schemas can't be exported | ✅ lens **graph** composed `forkB → v1 → v2` (3 ops), routing across branches; dropped `assignee`, renamed `name→title` | Cambria *routes* across a fork branch today; panproto's pushout-**merge** was unreachable at v0.51 |
| **Derive a schema artifact from the one lens** | ◑ diff/classify only; `checkExistence` errored `unknown protocol: "openapi". Supported: atproto` | ✅ `schemaForLens` emitted a JSON Schema (`title:string`, `priority` gone, `required` updated) | Cambria's "one lens → many artifacts" reproduced; panproto's protocol breadth is **uneven/leaky** |

### What the runs prove

- **Cambria is the better-matched, better-proven model for the runtime/cache/interop *core*.** Every property
  this doc leans on — rename-as-one-reversible-op, **patch-granular `ops` evolution**, translate-on-read with
  late-authored lenses, and cross-branch lens-graph routing — **worked on the first or second try** on the
  exact `task` change. The 2020 prototype did the runtime job; its only failure was the one it is honest about.
- **panproto's one technical win is `complement` — and it's closer to academically elegant than practically
  load-bearing for us.** It was the *only* engine to restore a dropped scalar losslessly, which is a genuine
  result. But losslessly reversing a *drop* only matters in a **server-less / pure-P2P** topology where a peer
  with a *narrower* schema is also the **persistence authority** — the Ink & Switch world. Cella/Raak has a
  **canonical server**: down-conversion is always *new server → old client*, the old client is never the
  source of truth, and the field it never saw still lives on the server. The cheap, battle-tested fix for the
  real version of this problem is **unknown-field passthrough** (keep the full record server-side, project a
  subset to old clients, never let an old client's echo clobber fields it couldn't see — exactly how protobuf
  unknown fields and Stripe's server-side transforms work). And `complement` isn't even free: it's an opaque
  ~350-byte msgpack sidecar you must store and ship *alongside* the down-converted data — if you're carrying
  the v1 information anyway, you may as well keep the original record, which the server already does. **Treat
  `complement` as a proof that reversibility is possible, not as a building block.**
- **panproto's "richer" reputation did not survive contact at v0.51.** No OpenAPI ingestion, intent-blind
  rename classification, `openapi` existence-checks unsupported, and the headline fork-**merge** (pushout) was
  fully blocked through both SDK and CLI. Its breadth is real on paper and leaky in practice.
- **Net, now evidence-backed and sharpened:** keep **Cambria's patch-lens model as the mental model for the
  runtime/cache/interop core** (it demonstrably evolves `ops` and routes across forks); solve the
  reverse/downgrade problem with **unknown-field passthrough**, not a lens complement; and file panproto's
  `complement` under "elegant proof, not adopted." Adopt *neither* runtime as a dependency: Cambria is
  unmaintained, panproto is pre-1.0 and partly non-functional through its bindings.

> **Caveat on durability.** These are point-in-time results: Cambria is frozen at its 2020 shape, panproto
> churns fast (v0.51, ~95 releases). The panproto blockers (SDK VCS, OpenAPI ingestion) may improve; the
> Cambria strengths will not regress (nothing is moving). Re-run before relying on either.
>
> **Where `complement` *would* earn its keep.** If Cella ever grows a genuinely server-less peer tier (two
> forks syncing directly, each the authority for its own narrower schema, with no shared canonical store),
> revisit `complement` — that's the one topology where unknown-field passthrough can't help and a lossless
> reverse sidecar becomes necessary rather than ornamental.

---

## References

- [Parallel Change — Martin Fowler / Danilo Sato](https://martinfowler.com/bliki/ParallelChange.html)
- [Cadwyn — Stripe-like API versioning for FastAPI](https://github.com/zmievsa/cadwyn) (single-truth → many tolerated versions)
- [Stripe API versioning](https://stripe.com/blog/api-versioning) — rolling versions, server-side transformers
- [oasdiff — OpenAPI breaking-change detection](https://github.com/oasdiff/oasdiff) ([GitHub Action](https://github.com/oasdiff/oasdiff-action))
- [openapi-diff — OpenAPITools](https://github.com/OpenAPITools/openapi-diff)
- [OpenAPI Overlay Specification 1.0.0](https://spec.openapis.org/overlay/v1.0.0.html) — standardized, ordered transformations applied to an OpenAPI description ([announcement](https://www.openapis.org/blog/2024/10/22/announcing-overlay-specification))
- [panproto](https://github.com/panproto/panproto) — protocol-agnostic schema diff → bidirectional lens (`get`/`put`/`complement`) + structural schema VCS; candidate engine for *calculating* Overlays from two resolved specs ([book](https://panproto.dev/book/))
- [Jazz 2.0 — migrations](https://jazz.tools/docs/schemas/migrations) ([garden-co/jazz](https://github.com/garden-co/jazz), Rust core + TS DSL; *not* Classic Jazz) — hash-addressed schema versions + **bidirectional declarative-diff lenses** + `backwardsDefault` + draft-on-ambiguity; closest prior art to this doc's cache-migration half
- [Cambria — Ink & Switch](https://www.inkandswitch.com/cambria/) ([inkandswitch/cambria](https://github.com/inkandswitch/cambria), [cambria-express](https://github.com/inkandswitch/cambria-express)) — **edit-lenses on JSON Patches** + **lens graph** (shortest-path between schema nodes) + **translate-on-read** + one-lens→three-artifacts; the closest conceptual blueprint for this doc's transform layer. Builds on [Edit Lenses (Hofmann/Pierce/Wagner)](http://dmwit.com/papers/201107EL.pdf)
- [Zero — schema changes](https://zero.rocicorp.dev/docs/schema#schema-changes) — deploy-ordered expand/contract + `onUpdateNeeded` reload
- [RxDB — data migration](https://rxdb.info/migration-schema.html) — per-collection up-only `migrationStrategies`
- [LiveStore — app evolution](https://docs.livestore.dev/patterns/app-evolution/) — event-sourced; re-materialize state, backwards-compatible events
- [Deprecation HTTP header — RFC 9745](https://www.rfc-editor.org/rfc/rfc9745) — signalling a deprecated resource/field
- [Kubernetes API deprecation policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/)
- [GitLab deprecation guidelines](https://docs.gitlab.com/ee/development/deprecation_guidelines/)
- [strong_migrations (Rails)](https://github.com/ankane/strong_migrations) — expand/contract DB migrations
- [Confluent Schema Registry compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html) — `BACKWARD`/`FORWARD`/`FULL`
- [Postel's Law / Robustness principle](https://en.wikipedia.org/wiki/Robustness_principle)
- [Sunset HTTP header — RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) — contract-phase signalling
- [Vercel Skew Protection](https://vercel.com/docs/deployments/skew-protection) — deployment-pinned version skew
- [Vite — load error handling (`vite:preloadError`)](https://vite.dev/guide/build.html#load-error-handling)
- [vite-plugin-pwa — register & update prompts](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- [SYNC_ENGINE.md](./SYNC_ENGINE.md) — offline sync, mutation queue, persistence
- [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) — Dexie persister
- [backend/src/core/stx/update-schema.ts](../backend/src/core/stx/update-schema.ts) — `ops` partial update contract
- [backend/scripts/generate-openapi.ts](../backend/scripts/generate-openapi.ts) — `diffHash` generation
