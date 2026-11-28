# Schema evolution

This document explains how breaking changes to entity wire shapes ship without stranding offline clients.

### TL;DR

When the API's fields change incompatibly, you add one permanent conversion module, a **lens**, that describes the old and new forms. From it, Cella accepts both forms during rollout, converts writes to the current form, and updates data already cached in browsers. Until the first lens ships, use the interim [cache reset](#cache-bust-interim).

## The lens model

A lens keeps older bundles working while fields change shape. You ship a breaking schema change, such as renaming `attachment.name` to `attachment.title`, as an **append-only lens module**. The lens declares the change once. Everything else derives from it: widened request schemas, key maps for writes, and migrations for cached rows.

An **expand** lens widens the wire: during its **expand window**, a renamed field has twin columns and the API accepts and returns both. A **contract** lens later removes the old shape.

Say a user edits an attachment's name in a tab on the old bundle. The tab sends `name`, the API accepts it, and the write fills both columns. A new-bundle tab reads it in `title`.

- **Canonical rows.** Writes store the newest shape, and the twin column during expand.
- **Frozen envelope.** `stx` and `ops`, counter keys and the auth and session contract change only additively.
- **Messages change with a release.** Stream frames, catchup answers and CDC messages are never stored.
- **Old tabs read new messages.** A tab open across a deploy meets the new shapes until it reloads.

## Cache-bust (interim)

Until the first lens ships, a breaking schema change resets client caches. In the PR that breaks a cached wire shape:

1. **Raise `appConfig.clientCacheVersion` by one** in [config.default.ts](../../shared/config/config.default.ts).
2. **Title the PR `feat!`**, as for any breaking change.

The breaking-change gate of the lint job in [ci.yml](../../.github/workflows/ci.yml) fails a breaking OpenAPI diff without a higher version.

What a client does at boot depends on its cache:

- **Older cache:** the client wipes its queries, and queued mutations replay on the fresh cache.
- **Newer cache:** the bundle marks itself stale and leaves the cache alone, as for a [newer lens pointer](#client-cache-migration).

**Teardown**: once lenses are stable, delete `clientCacheVersion`, the cache wipe and the breaking-change gate in ci.yml.

## Where a lens acts

A lens acts at two moments, marked ▣: a server write and a cache restore.

```text
lens module ─▶ widened schemas, key maps, cache-row migrations

write:  old or new body ─▶ widened validation ─▶ ▣ normalize ─▶ merge ─▶ DB
read:   DB row (both columns during expand) ─▶ response, no transform
boot:   cached rows behind the pointer ─▶ ▣ lens chain ─▶ hydrate

untouched: CDC, stream frames, catchup summaries, counters, activities
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

What a change needs depends on its kind:

- **A rename, an add, a drop or a retype:** a `delta` ([define.ts](../../shared/src/schema-evolution/define.ts)).
- **What a delta cannot express:** `custom` converters.
- **A rare restructure:** a drop plus an add with a computed default. A lens has no restructuring operation.
- **A split or a cross-entity move:** a one-off script.

## Entity coverage

| Data | What a lens covers |
| --- | --- |
| **Product** (`attachment`) | Full: schema widening, key maps for `ops` and field timestamps, cache and mutation migration |
| **Channel** (`organization`) | Reduced: body widening and normalization, cache and mutation migration |
| **Frozen envelope** | None: changes only through `apiVersion` |
| **Membership fields, enrichment output and Yjs-edited descriptions** | None: outside the lens system |

## Evolution contract

You register each entity module's wire bodies once through one of the two [evolutionContract](../../backend/src/core/schema-evolution/evolution-contract.ts) factories. The module routes its bodies through what the factory returns: lens-widened create and update schemas, and the functions that normalize a body to canonical keys.

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

During a lens's expand window, old-shape requests pass validation unchanged: the derived schemas accept both field names. The contract's normalize step maps `ops` and `stx.fieldTimestamps` to canonical keys. The contract also **mirror-writes** the twin column: a write to `title` or `name` writes both.

You drop the old column in a later contract PR, made by hand for now. It waits until the `X-Client-Version` header shows every client past the expand lens for the whole expand window.

### Client cache migration

At boot, the client compares its cache's `schemaVersion` pointer, the lens count of the bundle that wrote it, with its own:

- **Behind the bundle:** the client migrates the persisted queries and queued mutations. A pass cut short runs again.
- **Ahead of the bundle:** the bundle marks itself stale, restores nothing and never writes. It looks for its update, and an update it finds raises the reload prompt.

## CI guards

`lens:check` runs in `pnpm check` and the CI lint job, beside the [cache-bust](#cache-bust-interim) gate, and fails on:

- a shipped lens module that changed, awaits or imports dynamically
- a lens on the frozen envelope or another reserved field
- a contract lens with no earlier expand lens on the same field
- a configured entity type without an evolution contract
