# Drop the redundant `Entity` suffix from single-family identifiers

## What & why

Cella has two entity families: **channel entities** (membership-scoped, e.g. `organization`) and
**product entities** (content, e.g. `attachment`). The word `entity` belongs on genuinely
entity-agnostic code and on the type-string unions (`ChannelEntityType`, `productEntityTypes`, the
`entityType`/`entityId` discriminator columns). Many identifiers that were constrained to one
family still carried a redundant `Entity`. This sweep sharpens them:

- The two base schemas drop `Entity` and keep `Base`: `ChannelEntityBase` -> **`ChannelBase`**,
  `ProductEntityBase` -> **`ProductBase`** (with their `*BaseSchema` values, `channelBaseSelect`,
  mocks `mockChannelBase`/`mockProductBase`, and `.openapi()` component names).
- Everything else drops `Entity`: `getValidChannelEntity` -> `getValidChannel`,
  `EnrichedChannelEntity` -> `EnrichedChannel`, `ChannelEntityView` -> `ChannelView`,
  `ChannelEntityIdColumns` -> `ChannelIdColumns`, `channelEntityColumns` -> `channelColumns`, and so
  on across enrichment, routes, list-query wiring, UI, and DB column helpers. Product siblings move
  the same way (`getValidProductEntity` -> `getValidProduct`, `ProductEntityView` -> `ProductView`,
  `productEntityColumns` -> `productColumns`, …).

The full old -> new map is the `RENAMES` object in
[`drop-entity-suffix-renames.ts`](./drop-entity-suffix-renames.ts) (48 identifiers) and its
`FILE_STEMS` (9 files). It is an allow-list, word-boundary matched, so it can never touch the
type-string unions (`ChannelEntityType`, `productEntityTypes`, `entityType`, …).

The bare instance renames `channelEntity` -> `channel` (~140) and `channelEntityId` / `channelEntityIds`
/ `channelEntityKey` -> `channelId` / `channelIds` / `channelKey` are included, but only after a
per-file scan confirmed no real `channel` / `channelId` identifier co-occurs with them in the same
file (the large whole-repo counts of `channel` are the English word in comments, not identifiers).
None is a wire/SDK field, so they stay local renames. A fork whose own code pairs a `channelEntity`
variable with a distinct `channel` in the same file should reconcile that file by hand.

The permission subject map also becomes `ChannelScope` -> `AncestorChannelIds`. It carries ancestor
IDs and is distinct from the computed authorization scopes used for collection reads.

## Blast radius

Internal rename only. **No wire-shape change**: the OpenAPI component names change
(`ChannelEntityBase` -> `ChannelBase`, `ProductEntityBase` -> `ProductBase`) but the field shapes
are identical, so `oasdiff breaking` reports nothing and **no `clientCacheVersion` bump / lens is
needed**. It does rename public SDK type names, so it is a breaking change for external SDK
consumers: cut it as `feat!`. ~120 files upstream; a fork is affected wherever it references any
renamed identifier or imports a renamed file.

## Run

On fork-specific code after pulling the upstream sweep, from the repo root:

```sh
pnpm exec tsx cella/migrations/20260722T0902-drop-entity-suffix-renames/drop-entity-suffix-renames.ts inventory backend/src backend/tests backend/scripts frontend/src shared cdc/src yjs/src
pnpm exec tsx cella/migrations/20260722T0902-drop-entity-suffix-renames/drop-entity-suffix-renames.ts rewrite   backend/src backend/tests backend/scripts frontend/src shared cdc/src yjs/src
```

Add fork-specific single-family identifiers with `--extra-renames <file>` (a JSON `{ "old": "new" }`
object), never by editing the shipped script.

## Manual steps

1. **De-shadow the local mock type** (before or after the sweep): in
   `backend/src/modules/memberships/memberships-mocks.ts`, the module-local
   `type ChannelEntity = { id; tenantId }` is renamed to `ChannelRef` so it does not read as the new
   canonical `ChannelEntity`. The codemod does not touch it (no `ChannelEntity` key in the map).
2. **`git mv` the renamed files** (the codemod already rewrote the import paths that point at them):

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

- **`isChannelEntity` / `isProductEntity`** stay as-is. Dropping `Entity` (`-> isChannel`/`isProduct`)
  was considered and declined: those names already belong to the `hierarchy.isChannel` /
  `topology.isProduct` methods (the guards are thin wrappers over them), so a free function of the
  same name would blur the model and would force local booleans like
  `const isChannel = isChannelEntity(x)` into awkward renames. The guards read unambiguously as-is.

## Consolidation opportunities (noted, not done here)

- **`search-result-block.tsx`** used to re-derive `channelEntities.includes(entityType)`; now calls
  the `isChannelEntity` guard directly (done as a standalone cleanup, not part of this codemod). The
  local caches in `build-message.ts` and `validation.ts` are left as-is: they cache the guard result
  and carry its type narrowing, which is intentional, not redundant.
- **Test re-derivation**: `backend/tests/integration/rls-security.test.ts` and
  `backend/scripts/migrations/10-rls.migration.ts` each locally derive channel table names from
  `appConfig.channelEntityTypes`. There is no shared helper to import; consolidating would mean
  extracting one. Low value, left for later.
