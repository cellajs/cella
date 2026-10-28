---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: counts, getPublicCounts, publicCountsSchema, mapEntitiesToSchema, clientCacheVersion
---

# Public counts cover users and channel types only

`GET /metrics/public` answers `user` and one count per channel type; product types are gone from `publicCountsSchema`,
from `getPublicCountsOp` and from the SDK's `GetPublicCountsResponse`. The `counts` list in the app-owned
`frontend/src/modules/marketing/marketing-config.tsx` drops every product type it names. `mapEntitiesToSchema` is gone.

## What & why

The route counted on the runtime role outside a tenant, where row-level security hides every product row, so product
types always read 0. `counts` is now typed by `keyof GetPublicCountsResponse`, and `Counters` reads the response by
those ids, so a product id left in `counts` fails the typecheck.

## Blast radius

Apps whose `counts` lists a product type. Removing a required response property breaks the spec, so upstream bumped
`appConfig.clientCacheVersion` to `v24-public-counts` (one bump for this and the boolean query parser alignment). No
database or lens change. Known sites: raak `frontend/src/modules/marketing/marketing-config.tsx` (`task`).

## Run

No script: manual.

## Manual steps

1. Remove product types (raak: `task`) from `counts` in `frontend/src/modules/marketing/marketing-config.tsx`.
2. Replace a `satisfies` on `counts` that names `EntityType` with `keyof GetPublicCountsResponse` from `sdk`.
3. If `shared/config` sets its own `clientCacheVersion`, change its value.

## Verify

```sh
pnpm check
```
