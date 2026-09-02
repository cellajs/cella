# shared/src/schema-evolution

Schema-evolution lens registry (doba lenses).

**Vocabulary:** a **canonical** field name is the name in the entity's _current_ schema version; an **alias** is a pre-rename name old clients may still send. During an expand window both are accepted: lens seams normalize alias keys to canonical before any body access, and writes mirror to the twin field so old readers stay fresh.

## Lens convention: [`define.ts`](./define.ts)

A lens declares one breaking schema change once; widened wire schemas, ops/stx key maps, cache-row migrations, and versioned OpenAPI specs are derived from it. Lens modules are frozen once shipped and appended in date order to `lens-list.ts`. The global schema version is the lens count.

## Append point: [`lens-list.ts`](./lens-list.ts)

Append-only: never reorder or remove entries. A lens's index + 1 is its global schema ordinal.

## Engine: [`engine.ts`](./engine.ts)

The doba facade and the only module that imports `dobajs`, keeping the dependency swappable. Per lens-capable entity type (product and channel) it builds, lazily and only when that entity has lenses:

- a doba migration registry over derived version nodes (cache-row migration, Phase 2 peer downgrade);
- key maps for `ops` and `stx.fieldTimestamps` (server normalize seam, queued-mutation rewrite).

With an empty lens list (`currentSchemaVersion === 0`) every export is a passthrough no-op.

## Barrel: [`index.ts`](./index.ts)

Public entry point re-exporting the registry, config, definitions, and engine functions.
