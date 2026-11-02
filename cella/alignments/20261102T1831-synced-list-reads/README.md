---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: syncStaleTime, fetchAllPages, liveItems
---

# Synced product lists read through syncedListOptions

In each product module's `query.ts`, wrap the canonical list options in `syncedListOptions(queryOptions({ ... }), { organizationId, tenantId, channelId })` and every other list under the product's list keys, flat or paged, in `syncedListOptions(...)` without a scope, from `~/query/basic/synced-list-options`. `channelId` is the home channel the canonical key names, for a product homed below the organization; an org-homed list leaves it out.

## What & why

A full list read overwrote the changes patched in while it ran, and the cursor had moved past them; it replaced the optimistic row of a pending mutation until that settled; and a paged list read with the query's abort signal was cancelled, unmarked, when its last screen left. `syncedListOptions` merges the overlapped range on a canonical read, keeps rows with a pending mutation as cached, and gives the read no abort signal of the query's own.

## Blast radius

Breaking for an app with product modules of its own; the template's attachment module arrives wrapped. A list left unwrapped behaves as before. No database, cache version or lens change.

## Run

No script: manual.

## Manual steps

1. For each grep hit in a product module's list options, wrap the options its function returns: `return syncedListOptions(queryOptions({ ... }), scope)` or `return syncedListOptions(infiniteQueryOptions({ ... }))`. Leave `fetchAllPages`, `offsetPaging` and the `queryFn` inside as they are. Skip the hits that build no options: an export fetcher (raak's `fetchTasksForExport`) and the local `liveItems` in `attachment/hooks/use-resolved-attachments.ts`.
2. Pass a scope only to a canonical list: a home key, or the organization-wide list of a product homed below the organization. A list behind a server filter, such as one keyed by another product (`{ itemId }`, `{ assignmentItemId }`), takes no scope: a range row cannot be checked against its filter.
3. Where the home channel comes from a placement (`resolveProductHome(type, placement)?.id`), pass the same id as `channelId` that the key builder uses.
4. A feed under the product's list keys, such as projectcampus `itemsHomeFeedOrgOptions` (`['item', 'list', organizationId, { feed, q }, limit]`), is one: sync patches its rows, an edit cancels its read and a new row marks it, so wrap it without a scope. Lists under keys of their own, such as raak's public `publicList`, stay as they are.
5. A wrapped paged list keeps `meta: { persist: false }`, as the template's filtered lists have it: a page stored on disk could keep a hidden id whose delete settled while the page was there.
6. A wrapped list refetches when a reader mounts and the list carries a refetch mark, whatever the app's global `refetchOnMount`; remove a `refetchOnMount: true` a board or table set for that. Without the wrap, a list marked while off screen (an opaque view, an archived organization, an overflow) never refetches under `refetchOnMount: false`.
7. A canonical read that already carries rows of its own (raak's `carryUnansweredCreates`) keeps doing so; the helper runs after it. A canonical list with a server filter of its own (raak's `acceptedCutOff`) takes the merged range rows the filter would leave out, as a live patch of that list does.

## Verify

Throttle the browser's network so a list read takes seconds, reopen a product list and rename one of its rows from a second session while it loads: the new name stays once the list shows. Then run `pnpm check`.
