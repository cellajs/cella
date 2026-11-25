---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: switchedOffProductTypes, xTool, attachmentsCanonicalOptions
---

# An app can switch a product off

Add `switchedOffProductTypes` to the app's `config.default.ts`, empty to keep every product. A product type it lists
is off: routes that name `xEnabledBy: { product: '<type>' }` answer 404 to every caller, the API docs mark them off and
MCP lists no tool for them. Attachment's nine routes name the switch. An app that offers no attachments lists
`'attachment'` and follows the steps below.

## What & why

`ConfigSwitch` takes a fifth kind, `{ product }`, on while `appConfig.switchedOffProductTypes` leaves the type out. A
template product an app did not offer stayed in its API docs, its MCP tool list and its members table. Attachment's
routes, the private upload token, the "Offline files" preference, the upload control, the member stat columns, unseen
counts and the prefetch in the pinned `frontend/src/entity-sync-queries.ts` follow the switch.

## Blast radius

Every app adds one config key, caught by the compiler. Nothing else changes for an app that keeps every product. No
cache bump and no migration. A product that is off keeps its table, policy and access scopes: a key holding such a
scope reaches nothing.

## Run

No script: manual.

## Manual steps

1. Caught by the compiler. In `shared/config/config.default.ts` add `switchedOffProductTypes: [] as readonly (typeof hierarchy.productTypes)[number][]`.
2. To switch attachments off, list `'attachment'` there and add `switchedOffProductTypes: []` to `shared/config/config.test.ts`: the template's tests use attachment as their example product.
3. Keep the product's `case` in `permissions-config.ts`: deleting it removes its scopes from the SDK, which five template test files name.
4. Hide the attachments tab on each channel type that shows it: `surfaces: { 'organization.tabs': { hidden: ['attachments'] } }` in `config.default.ts`.
5. In the pinned `frontend/src/entity-sync-queries.ts`, wrap the product's prefetch in `isSwitchOn({ product: '<type>' })`: its list route answers 404 while off.
6. Leave `memberStatProductTypes` and `seenTrackedProductTypes` as they are: both skip a product that is off.
7. Optional. Give each route of an app-owned product module `xEnabledBy: { product: '<type>' }`, as `attachment-routes.ts` does, to make it switchable too.

## Verify

Open the API docs: the product's operations show "Off". Call one of its routes: it answers 404 `route_not_found`.
Then run:

```sh
pnpm check
pnpm test
```
