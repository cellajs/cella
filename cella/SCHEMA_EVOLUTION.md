# Schema evolution

This document explains how breaking changes to entity wire shapes ship without stranding offline clients.

### TL;DR

When the fields returned by the API change incompatibly, add one permanent conversion module, a **lens**, that describes the old and new forms. From it, Cella accepts both forms during rollout, converts writes to the current form, and updates data already cached in browsers. No lens has shipped yet, so until one does, use the interim [cache reset](#cache-bust-interim).

## The lens model

A breaking schema change, such as renaming `attachment.name` to `attachment.title`, ships as an **append-only lens module**. The lens declares the change once. Everything else derives from it: widened request schemas, key maps for writes, and migrations for cached rows.

- **Canonical inside, dual-emit at the edge.** Database, CDC, activities and stream see only the newest shape.
- **Frozen envelope.** `stx` and `ops`, counter keys and the auth and session contract change only additively.
- **Messages change with a release.** Stream frames, catchup answers and CDC messages are never stored.
- **Old tabs read new messages.** A tab open across a deploy meets the new shapes until it reloads.
- **No version negotiation.** The server tells old from new by which fields a request carries.
- **A cache pointer.** The client cache reads its version from a persisted `schemaVersion`, not its rows.
- **One global version.** `currentSchemaVersion` is the lens count, baked into both bundles from `shared`.

## Cache-bust (interim)

Until the first lens ships, a breaking schema change resets client caches:

1. **Bump `appConfig.clientCacheVersion`** in [config.default.ts](../shared/config/config.default.ts) in the PR that breaks a cached wire shape.
2. **Title the PR `feat!`**, as for any breaking change.
3. **Clients wipe, mutations stay.** After a mismatch at boot, queued mutations replay on the fresh cache.
4. **CI gate.** `schema-bust-gate` in [ci.yml](../.github/workflows/ci.yml) fails a breaking OpenAPI diff without that bump.

**Teardown**: once lenses are stable, delete `clientCacheVersion`, the persister's wipe and the `schema-bust-gate` job.

## Transformation points

A lens acts at two runtime points, marked ▣. The rest is derived at build time.

```text
lens module ─▶ widened schemas, key maps, cache-row migrations

write:  old or new body ─▶ widened validation ─▶ ▣ normalize ─▶ merge ─▶ DB
read:   DB row (both columns during expand) ─▶ response, no transform
boot:   cached rows behind the pointer ─▶ ▣ lens chain ─▶ hydrate

untouched: CDC worker, stream frames, catchup summaries, counters, activities
```

## Lens anatomy

An illustrated lens module, since none has shipped yet:

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

A `delta` renames, adds, drops or retypes a field ([define.ts](../shared/src/schema-evolution/define.ts)). `custom` converters cover what a delta cannot express. A lens has no restructuring operation. Model a rare restructure as a drop plus an add with a computed default. Keep splits and cross-entity moves as one-off scripts.

## Entity coverage

| Entities | Lens coverage |
| --- | --- |
| **Product** (`attachment`) | Full: schema widening, key maps for `ops` and field timestamps, cache and mutation migration |
| **Channel** (`organization`) | Reduced: body widening and normalization, cache and mutation migration. No key maps, since a channel update sends no `ops`. |
| **Frozen envelope** | None: changes only through `apiVersion` |

Membership fields, enrichment output and Yjs-edited descriptions sit outside the lens system.

## Evolution contract

Every entity module registers its wire bodies once through one of the two [evolutionContract](../backend/src/core/schema-evolution/evolution-contract.ts) factories. It routes its bodies through what the factory returns: lens-widened create and update schemas, and the functions that normalize a body to canonical keys.

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

No middleware and no body re-parsing. During a lens's expand window the derived schemas accept both field names, so old-shape requests pass validation unchanged. The contract's normalize step then maps `ops` and `stx.fieldTimestamps` to canonical keys, so the merge sees canonical keys only. It also **mirror-writes** the twin column, so a write to `title` or `name` writes both. Reads need no transform, since the row carries both columns during expand.

A later contract PR, made by hand for now, drops the old column. It waits until `X-Client-Version` shows every client past the expand lens for the whole expand window.

### Client cache migration

The meta record's `schemaVersion` pointer is the global lens ordinal.

- Pointer behind the bundle: one tab at a time migrates the persisted queries and queued mutations.
- A pass cut short runs again, since the pointer advances only in the pass's final write.
- Pointer ahead of the bundle: the bundle marks itself stale, restores nothing and never writes.

### CI guards

1. **`lens:check`** runs in `pnpm check` and the CI lint job. It fails on:
   - a shipped lens module that changed or is impure
   - a lens on the frozen envelope or another reserved field
   - a configured entity type without an evolution contract
2. **`schema-bust-gate`**: the [cache-bust](#cache-bust-interim) gate.
