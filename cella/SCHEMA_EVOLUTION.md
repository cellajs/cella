# Schema evolution

This document explains how breaking changes to entity wire shapes ship without stranding offline clients.

### TL;DR

When the fields returned by the API change incompatibly, add one permanent conversion module, a **lens**, that describes the old and new forms. From it, Cella accepts both forms during rollout, converts writes to the current form, and updates data already cached in browsers. No lens has shipped yet, so until one does, use the interim [cache reset](#cache-bust-interim).

## The lens model

A breaking schema change (rename `attachment.name` to `attachment.title`, say) ships as an **append-only lens module**. The lens declares the change once. Everything else derives from it: widened request schemas, key maps for writes, and migrations for cached rows.

- **Canonical inside, dual-emit at the edge.** Database logic, CDC, activities, the detail cache and the stream see the newest shape only. The **frozen envelope** around entities (the `stx` and `ops` structure, stream frames, catchup summaries, counter keys, the auth and session contract) changes only additively or through an `apiVersion` bump, never through a lens.
- **No version negotiation.** The server tells old from new by which fields a request carries. The client cache knows which version it holds from its persisted `schemaVersion` pointer, not from the rows.
- **One global version.** `currentSchemaVersion` is the lens count, baked into both bundles from `shared`.

## Cache-bust (interim)

Until the first lens ships, a breaking schema change resets client caches:

1. **Bump `appConfig.clientCacheVersion`** ([config.default.ts](../shared/config/config.default.ts)) in the same PR as any breaking change to a cached entity's wire shape, and give the PR a `feat!` title, as for any breaking change.
2. **Clients wipe, mutations stay.** On boot the persister compares the persisted version with the bundle's. On a mismatch it wipes cached query data but keeps queued mutations, which replay against the fresh cache. A replay the server then refuses is quarantined, never dropped.
3. **CI gate.** `schema-bust-gate` in [ci.yml](../.github/workflows/ci.yml) fails a PR with a breaking OpenAPI diff unless it bumps `clientCacheVersion`.

**Teardown**: once lenses are stable, delete `clientCacheVersion`, the persister's wipe and the `schema-bust-gate` job. The `failedSync` quarantine stays: it also holds queued mutations no upgrade can read.

## Transformation points

A lens acts at two runtime points (▣); the rest is derived at build time.

```text
lens module ─▶ widened schemas, key maps, cache-row migrations

write:  old or new body ─▶ widened validation ─▶ ▣ normalize ─▶ merge ─▶ DB
read:   DB row (both columns during expand) ─▶ response, no transform
boot:   cached rows behind the pointer ─▶ ▣ lens chain ─▶ hydrate

untouched: CDC worker, stream frames, catchup summaries, counters, activities
```

## Lens anatomy

A lens module, illustrated (no lens has shipped, so no such file exists yet):

```ts
// shared/src/schema-evolution/2026-07-01-attachment-name-to-title.ts
export default defineLens({
  id: '2026-07-01-attachment-name-to-title',
  entityType: 'attachment',
  description: 'Rename attachment.name to attachment.title',
  phase: 'expand', // 'expand' | 'contract': drives spec and wire widening
  delta: { rename: { from: 'name', to: 'title' } },
});
```

A `delta` renames, adds, drops or retypes a field ([define.ts](../shared/src/schema-evolution/define.ts)), and `custom` converters cover what a delta cannot express. There are no restructuring operations: model a rare restructure as a drop plus an add with a computed default, and keep splits and cross-entity moves as one-off scripts.

## Entity coverage

| Entities | Lens coverage |
| --- | --- |
| **Product** (`attachment`) | Full: schema widening, key maps for `ops` and field timestamps, cache and mutation migration |
| **Channel** (`organization`) | Reduced: body widening and normalization, cache and mutation migration. No key maps: a plain `PUT` body has no per-field merge. |
| **Frozen envelope** | None: changes only through `apiVersion` |

Membership fields, enrichment output (`membership`, `can`) and Yjs-edited descriptions sit outside the lens system.

## Evolution contract

Every entity module registers its wire bodies once through one of the two [evolutionContract](../backend/src/core/schema-evolution/evolution-contract.ts) factories, and routes its bodies through what that returns: lens-widened create and update schemas, and the functions that normalize a body to canonical keys.

```ts
export const attachmentContract = evolutionContract.product('attachment', {
  createItem: attachmentCreateBodySchema,
  updateOps: { name: z.string().max(maxLength.field) /* … */ },
  blockFields: ['description'], // block-document fields whose media references are checked
});

export const organizationContract = evolutionContract.channel('organization', { createItem, updateBody });
```

## How it works

### Server write path

No middleware and no body re-parsing. During a lens's expand window the derived schemas accept both field names, so old-shape requests pass validation unchanged. The contract's normalize step then maps `ops` and `stx.fieldTimestamps` to canonical keys and **mirror-writes** the twin column (a `title` write also writes `name`, and the other way round), so the merge sees canonical keys only. Reads need no transform: during expand the row carries both columns.

The old column goes in a later contract PR, once the clients' `X-Client-Version` shows the fleet past the expand lens for the whole expand window. That step is manual for now.

### Client cache migration

The meta record's `schemaVersion` pointer is the global lens ordinal.

- Pointer behind the bundle: before hydration, one tab at a time runs a migration pass over the persisted queries and the queued mutation variables. The pointer advances in its final write, so a pass cut short runs again.
- Pointer ahead of the bundle (another tab migrated forward, or a rollback deploy): the bundle marks itself stale, restores nothing, and never writes.

### CI guards

1. **`lens:check`**, in `pnpm check` and the CI lint job, keeps shipped lens modules unchanged and pure, keeps lenses off the frozen envelope and other reserved fields, and requires an evolution contract for every configured entity type.
2. **`schema-bust-gate`**: the [cache-bust](#cache-bust-interim) gate.
