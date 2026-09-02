# Drop the redundant `Entity` suffix from single-family identifiers

## What & why

Identifiers constrained to one entity family drop their redundant `Entity`: `ChannelEntityBase` ->
`ChannelBase`, `ProductEntityBase` -> `ProductBase` (with `*BaseSchema`, `channelBaseSelect`,
`mockChannelBase`/`mockProductBase`, `.openapi()` names), `getValidChannelEntity` -> `getValidChannel`,
`EnrichedChannelEntity` -> `EnrichedChannel`, `ChannelEntityView` -> `ChannelView`,
`ChannelEntityIdColumns` -> `ChannelIdColumns`, `channelEntityColumns` -> `channelColumns`, product
siblings (`getValidProduct`, `ProductView`, `productColumns`), bare `channelEntity` -> `channel`,
`channelEntityId`/`Ids`/`Key` -> `channelId`/`Ids`/`Key`, `ChannelScope` -> `AncestorChannelIds`.
Type-string unions (`ChannelEntityType`, `productEntityTypes`, `entityType`/`entityId`) keep
`entity`. Full map: `RENAMES` (48 ids) and `FILE_STEMS` (9 files) in
[`drop-entity-suffix-renames.ts`](./drop-entity-suffix-renames.ts), allow-listed and word-boundary
matched.

## Blast radius

Internal rename, ~120 upstream files. No wire-shape change (OpenAPI component names change, field
shapes identical; `oasdiff breaking` clean; no `clientCacheVersion` bump or lens). Public SDK type
names change: cut as `feat!`. Affected wherever an app references a renamed identifier or file; a
file pairing its own `channelEntity` with a distinct `channel` is reconciled by hand.

## Run

On app-specific code after pulling the upstream sweep:

```sh
pnpm exec tsx cella/migrations/20260722T0902-drop-entity-suffix-renames/drop-entity-suffix-renames.ts inventory backend/src backend/tests backend/scripts frontend/src shared cdc/src yjs/src
pnpm exec tsx cella/migrations/20260722T0902-drop-entity-suffix-renames/drop-entity-suffix-renames.ts rewrite   backend/src backend/tests backend/scripts frontend/src shared cdc/src yjs/src
```

App-specific identifiers go in `--extra-renames <file>` (a JSON `{ "old": "new" }` object), never in
the shipped script.

## Manual steps

1. In `backend/src/modules/memberships/memberships-mocks.ts`, rename the module-local
   `type ChannelEntity = { id; tenantId }` to `ChannelRef` (the codemod has no `ChannelEntity` key).
2. `git mv` the renamed files (import paths are already rewritten):

   | old | new |
   | --- | --- |
   | `backend/src/permissions/get-channel-entity.ts` | `get-valid-channel.ts` |
   | `backend/src/permissions/get-product-entity.ts` | `get-valid-product.ts` |
   | `backend/src/db/utils/channel-entity-columns.ts` | `channel-columns.ts` |
   | `backend/src/db/utils/product-entity-columns.ts` | `product-columns.ts` |
   | `backend/src/schemas/channel-entity-included.ts` | `channel-included.ts` |
   | `backend/src/mocks/mock-channel-entity-id-columns.ts` | `mock-channel-id-columns.ts` |
   | `frontend/src/utils/channel-entity-route.ts` | `channel-route.ts` |
   | `frontend/src/hooks/use-page-channel-entity-key.ts` | `use-page-channel-key.ts` |
   | `frontend/src/modules/memberships/leave-channel-entity-button.tsx` | `leave-channel-button.tsx` |

## Verify

```sh
pnpm sdk      # OpenAPI component + SDK type names changed
pnpm check    # single gate: sdk regen + typecheck + lint:fix
```

## Not renamed (decided)

`isChannelEntity` / `isProductEntity` stay: `isChannel` / `isProduct` already name the
`hierarchy.isChannel` / `topology.isProduct` methods the guards wrap.
