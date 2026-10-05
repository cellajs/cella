---
syncBreaking: true
clientCacheBump: false
---

# A notification opens a product on its own deepLinkParam, not on a channel's notificationSearch

`channelRouteConfig.notificationSearch` is gone from `frontend/src/routes-config.tsx` and from its
`ChannelRouteEntry` type. The product module declares the search param that opens one of its rows:
`product: { entityType: 'attachment', deepLinkParam: 'attachmentDialogId' }`, and a product rendered
inside a host (a comment in its item) names it with `deepLinkHost: 'item'` instead. `getNotificationRoute`
reads both from the registry and sends the subject's param and the host's, since the target route strips
whichever it does not declare in `validateSearch`.

## What & why

Every `notificationSearch` in cella, raak and projectcampus was the same closure: a switch on
`entityType` returning one param at `subjectId`, or at `contextId` for a comment. That is per-product
data, not per-channel behavior, so raak repeated `attachment` in two channels and projectcampus
shared one `feedNotificationSearch` across three. `ProductModuleConfig` gains `deepLinkParam` and
`deepLinkHost`, read through `getProductDeepLink`, and `routes-config.tsx` keeps only `path`,
`paramName` and `subitemOf`.

## Blast radius

Every app whose pinned `routes-config.tsx` declares `notificationSearch`; typecheck names each one as an
excess property. An app that declares none is unaffected. Notification deep links open nothing until the
product modules declare their params. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. For each `notificationSearch` branch `entityType === 'x' ? { someParam: subjectId }`, add `deepLinkParam: 'someParam'` to the `product` of `frontend/src/modules/x/x-module.ts(x)`. Import the param's constant where one exists (cella uses `ATTACHMENT_DIALOG_PARAM`) so the module and the route schema cannot drift.
2. For each branch that opens a host at `contextId` (projectcampus: `entityType === 'comment' ? { itemId: contextId }`), add `deepLinkHost: 'item'` to the comment module's `product` and `deepLinkParam: 'itemId'` to the item module's. The host's param is looked up in the registry, so it is written once.
3. Delete every `notificationSearch` entry from `channelRouteConfig`, and the field from the `ChannelRouteEntry` type above it. raak also drops its two-channel duplication; projectcampus drops the `feedNotificationSearch` helper.
4. A param that differs per channel for one product has no replacement: the product carries one param. Give the page a single param name first.
5. Check which tab the link lands on: the redirect targets the channel's layout route and `guardNavTabs` lands on the first id in that surface's `appConfig.surfaces` list, so the param is stripped unless that tab's `validateSearch` declares it. Put the tab that renders the product first, or declare the param on every tab of the surface.

## Verify

```sh
pnpm --filter frontend exec vitest run src/lib/entity-modules.test.ts src/modules/notification
pnpm check
```
