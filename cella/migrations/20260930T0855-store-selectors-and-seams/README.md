---
syncBreaking: true
clientCacheBump: false
---

# Store selector gate, per-channel role types, idempotency and block-field seams, app bundle externals

pnpm style fails a zustand store hook called without a selector, after the overlay providers
re-rendered every UI-store reader on each open and close. checkIdempotency takes the table and
builds the creator and request-scope predicate itself, evolutionContract.product declares
blockFields and exposes assertBlockFields for creates and updates, the hierarchy role getters are
typed per channel and shared exports OrganizationRole, the three tsup configs derive their externals
from one keepOnDisk helper plus the pinned backend/src/bundle-config.ts, pnpm generate forwards
extra arguments to drizzle-kit, security suites declare the member attachment policy they assume,
and PR CI typechecks, builds the three service bundles and, on the release PR, the three images.

## What & why

The overlay providers read the whole UI store, so every open and close re-rendered each reader:
`pnpm style` now fails a store hook called without a selector. Seams a product module could skip
are template-owned: `checkIdempotency(ctx, table, stxId)` builds its own predicate,
`evolutionContract.product` takes `blockFields`, the role getters are typed per channel
(`OrganizationRole`), and the three `tsup.config.ts` read app externals from the pinned
`backend/src/bundle-config.ts`. PR CI typechecks and builds the service bundles.

## Blast radius

Sync-breaking for every app: `pnpm style` fails on selector-less store calls, and a
`checkIdempotency` call with a closure does not compile. No `clientCacheVersion` bump, no database
change.

## Run

No script: manual.

## Manual steps

1. Frontend: `node shared/scripts/check-frontend-style.ts` lists every selector-less store call; read one value per call (`useUIStore((state) => state.lockUI)`), or `useShallow` from `zustand/react/shallow` for a multi-pick.
2. Product creates: replace `checkIdempotency(stxId, () => find<X>ByStxMutationId(...))` with `checkIdempotency(ctx, <x>Table, stxId)`, delete the module's `find<X>ByStxMutationId` query, and run `withAuditUsers` on the result.
3. Product contracts: declare the block-document fields as `blockFields: ['description']` on `evolutionContract.product(...)`, call `<x>Contract.assertBlockFields(item, organizationId)` per item in the create loop once the home is resolved and on the update ops, and drop the direct `assertBlockMediaUrls` calls in product ops.
4. Bundles: `backend/src/bundle-config.ts` arrives pinned; move app entries from the tsup `KEEP_ON_DISK` and `external` lists into `appKeepOnDisk` (plain package names) and take the template's three `tsup.config.ts`. A package listed there must be in the service's `dependencies`, since the runtime image installs with `--prod`.
5. Roles: `hierarchy.getRoles`, `getMostPrivilegedRole` and `getLeastPrivilegedRole` return the named channel's roles; drop casts of the organization fixtures to the API's role type and use `OrganizationRole` from `shared` where a type is needed.
6. Tests: a suite that asserts a member's attachment rights calls `assumeMemberAttachmentPolicy({ ... })` (`backend/tests/security/helpers.ts`) at its top; `mark-seen.test.ts` skips where `attachment` is not seen-tracked.
7. CI: `ci.yml` gains `build-services` (every PR: `pnpm ts` and the three bundles) and `docker-images` (release PR: the three targets); add `build-services` to the branch ruleset's required checks.
8. `pnpm generate -- --hints '<json-array>'` now reaches drizzle-kit: no action.

## Verify

```sh
pnpm style
pnpm --filter backend --filter cdc-worker --filter yjs-worker build
pnpm check
```
