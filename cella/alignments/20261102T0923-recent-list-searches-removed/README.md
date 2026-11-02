---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# Recent list searches leave the navigation store

Move any use of `recentListSearches`, `saveRecentListSearch` or `removeRecentListSearch` on `navigationStore`, and of `addRecentListSearch` or `RecentListSearch` from `~/utils/recent-searches`, into your module's own store. `SearchChipsField` keeps its `recents` and `onSearchEnd` props.

## What & why

`navigationStore` held recent searches for lists with filters, under a list key, yet no template list uses them. Their shape and scope belong to the list: a list's filters often only make sense inside one entity, which one shared key cannot express. The template's text recents stay.

## Blast radius

Apps that pass `recents` to `SearchChipsField` through these store fields. Breaking, no database or cache change. An app without them is unaffected. Moved recents start over: the navigation store drops the old entries on its next write.

## Run

No script: manual.

## Manual steps

1. Add the recents to your module's persisted store, keyed by the entity whose list is searched, with the dedupe and limit your list needs.
2. Point `recents` and `onSearchEnd` at that store.

## Verify

```sh
pnpm check
```
