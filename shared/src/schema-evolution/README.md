# shared/src/schema-evolution

Schema-evolution lens registry (doba lenses).

## Lens convention — [`define.ts`](./define.ts)

A lens declares a single breaking schema change once; everything else
(widened wire schemas, ops/stx key maps, cache-row migrations, versioned
OpenAPI specs) is derived from that declaration.

Lens modules are frozen once shipped and appended in date order to
`lens-list.ts`. The global schema version is the lens count.

## Append point — [`lens-list.ts`](./lens-list.ts)

The designated append point for schema evolution: append-only, never reorder
or remove existing entries. A lens's index + 1 is its global schema ordinal.

## Engine — [`engine.ts`](./engine.ts)

The doba facade: the only module that imports `dobajs`, keeping the
dependency swappable (vendoring escape hatch) and the integration
concentrated in one place.

Builds, per lens-capable entity type (product and context):
- a doba migration registry over derived version nodes (cache-row migration,
  Phase 2 peer downgrade), lazily, only when that entity has lenses;
- key maps for `ops` and `stx.fieldTimestamps` (server normalize seam,
  queued-mutation rewrite).

With an empty lens list (`currentSchemaVersion === 0`) every export is a safe
passthrough no-op.

## Barrel — [`index.ts`](./index.ts)

Public entry point re-exporting the registry, config, definitions, and engine
functions listed above.
