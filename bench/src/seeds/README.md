# Bench seed registry

How load-test seed data is defined, registered, and cleaned up.

## Self-registration

Each `*.bench.ts` file here calls `registerBenchSeed()` as an import side effect (same pattern as `shared/src/module-registry.ts`). `data-setup.ts` auto-imports every `*.bench.ts` under `seeds/`, so an app adds a load-test table by dropping in one file, with no barrel or `data-setup.ts` edit.

## Seed kinds

- **Table seeds** (`TableBenchSeed`, `kind: 'table'` or omitted): rows for a plain insert into one table.
- **Custom seeds** (`CustomBenchSeed`, `kind: 'custom'`): a named lifecycle hook for bespoke SQL, e.g. tenant upserts or cleanup-only rows.

## Identity bands

Every id-based seed claims a UUID variant byte (`idVariant`, the fourth UUID group, e.g. `a005`). cella core owns the `a*` band; apps claim `b*`, so core and app entities never collide across upstream syncs. The id helpers in `ids.ts` and each seed's `idVariant` share one `CORE_ID_VARIANTS` source, so an id and the cleanup predicate that deletes it cannot drift. `registerBenchSeed` rejects malformed or duplicate variants at load time.

## Adding an app seed

Copy `attachment.bench.ts` (the reference) to `seeds/<name>.bench.ts`, point it at your table/mock, then:

- pick an `order` of 100 or higher (core seeds use under 100), after anything you FK-reference (e.g. `task.bench.ts` after `project.bench.ts`)
- claim an unused `idVariant` in the `b*` band, or set an explicit `cleanupWhere` when rows have no id
- import id/relation helpers from `./ids`

Seed files run in Node.js via `data-setup.ts`, not inside Artillery scenarios.
