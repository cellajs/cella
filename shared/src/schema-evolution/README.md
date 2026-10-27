# shared/src/schema-evolution

Schema-evolution lens registry (doba lenses).

**Vocabulary:** a **canonical** field name is the name in the entity's _current_ schema version; an **alias** is a pre-rename name old clients may still send. During an expand window both are accepted: the lens hooks in `evolutionContract` normalize alias keys to canonical before any body access, and writes mirror to the twin field so old readers stay fresh.

## Lens convention: [define.ts](./define.ts)

A lens declares one breaking schema change once; widened wire schemas, ops/stx key maps and cache-row migrations are derived from it. Versioned OpenAPI specs are Phase 2.

## Append point: [lens-list.ts](./lens-list.ts)

Append-only: never reorder or remove entries. A lens's index + 1 is its global schema ordinal.

## Engine: [engine.ts](./engine.ts)

The doba facade and the only module that imports `dobajs`, keeping the dependency swappable. Per lens-capable entity type (product and channel) it builds, lazily and only when that entity has lenses:

- a doba migration registry over derived version nodes (cache-row migration, Phase 2 peer downgrade);
- key maps for `ops` and `stx.fieldTimestamps` (the server's `normalizeOps` call, queued-mutation rewrite).

With an empty lens list (`currentSchemaVersion === 0`) every export is a passthrough no-op.

## Public entry: [schema-evolution.ts](../schema-evolution.ts)

`shared/schema-evolution` re-exports what the backend and frontend read: the schema version, the lens entity type, and the engine functions. Lens modules, the tests and `lens:check` import the files here by path.
