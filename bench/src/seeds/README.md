# Bench seed registry

How load-test seed data is defined, registered, and cleaned up.

## Self-registration

Each `*.bench.ts` file in this directory calls `registerBenchSeed()` as an
import side effect (mirrors the cella module/tag registry pattern in
`shared/src/module-registry.ts`). `data-setup.ts` auto-imports every
`*.bench.ts` file under `seeds/`, so a fork adds a load-test table (entity or
resource) by dropping in one new file, no barrel or `data-setup.ts` edit
required.

## Seed kinds

- **Table seeds** (`TableBenchSeed`, `kind: 'table'` or omitted): produce rows
  for a plain insert into one table.
- **Custom seeds** (`CustomBenchSeed`, `kind: 'custom'`): a named lifecycle
  hook for bespoke SQL that isn't a simple row insert, for example tenant
  upserts or cleanup-only rows.

## Identity bands

Every id-based seed claims a UUID variant byte (`idVariant`, the fourth UUID
group, e.g. `a005`). cella core owns the `a*` band; forks claim the `b*` band,
so core and fork entities never collide across upstream syncs (mirrors the
`order` under 100 / 100-or-higher split below). The id helpers in `ids.ts` and
each seed's `idVariant` share the same `CORE_ID_VARIANTS` source, so an id and
the cleanup predicate that deletes it can't drift apart. `registerBenchSeed`
rejects malformed or duplicate variants at load time.

## Adding a fork seed

Copy an existing `*.bench.ts` file (`attachment.bench.ts` is the reference
implementation) to `seeds/<name>.bench.ts`, point it at your table/mock, then:

- pick an `order` of 100 or higher (core seeds use under 100); order after
  anything you FK-reference (e.g. `task.bench.ts` seeds after
  `project.bench.ts`)
- claim an unused `idVariant` in the `b*` band, or set an explicit
  `cleanupWhere` if rows aren't identified by an id
- import id/relation helpers from `./ids`

These seed files run in Node.js via `data-setup.ts`, not inside Artillery
scenarios.
