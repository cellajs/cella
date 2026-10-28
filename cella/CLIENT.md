# Client (React)

This document explains the client's central object: the query client that holds server data in the
browser, plus the services that read and update it.

### TL;DR

Every tab runs one query client. API requests fill it, live updates patch it, background services subscribe to it, and a persister writes selected parts to a per-user database. Even file downloads start from what appears in it. **The query client is where all server data comes together**.

## Bigger picture

Five state owners. This document unpacks the query client. `localUserDb` is the per-user database described [below](#the-per-user-database).

| State kind | Runtime owner | Persistence |
| --- | --- | --- |
| Shareable navigation and view state | TanStack Router | URL and browser history |
| **Server entities and resources** | TanStack Query | Selected queries in `localUserDb` |
| Signed-in client state | Zustand | `localUserDb` key/value records |
| Bootstrap user and UI preferences | Zustand | `localStorage`, available before `localUserDb` opens |
| App shell and static assets | Browser | Service-worker Cache Storage |

```text
         SDK requests           live updates (sync engine)
               │                        │
               ▼                        ▼
 ┌─────────────────────────────────────────────────────┐
 │             query client (one per tab)              │
 │                                                     │
 │  query cache                 mutation cache         │
 │  ├─ channel lists + details  ├─ optimistic writes   │
 │  ├─ canonical product lists  ├─ paused offline queue│
 │  ├─ filtered lists           └─ replay defaults     │
 │  └─ me + unseen counts                              │
 └──────┬──────────────────┬──────────────────┬────────┘
        │ subscribers      │ persister        │ feeds
        ▼                  ▼                  ▼
   enrichment         localUserDb        download queue
   unseen deltas      (queries, meta,    + blob storage
   blob cleanup       kv, failed sync)   (blobs table)
```

## Inside the cache

- **Channel entity lists and details**: plain queries, refetched on membership signals.
- **Canonical product lists**: one flat, complete list per [home channel](./SYNC_ENGINE.md#selective-sync), patched by live updates. Components narrow it with `select()`.
- **Filtered product lists**: server-side search and sort results under their own keys. They are invalidated, not patched. A new row skips the lists it cannot belong to when its entity declares equality filter keys.
- **Session queries**: `me`, memberships, invites, unseen counts.

Each entity module registers its query keys and range fetch once in its `query.ts`, so generic cache and realtime code never import entity modules. Staleness follows the stream ([Freshness](./SYNC_ENGINE.md#freshness)). Sync deliveries are plain cache writes: upserts or invalidations.

### Imperative reads

`queryClient.query()` and `queryClient.infiniteQuery()` are the only imperative read methods; TanStack Query deprecates the older ones.

- **Cache-first**, for route guards and offline cache seeding: `query({ ...options, staleTime: 'static' })`. Only a cold entry fetches; a cached one comes back whatever its age or invalidation state.
- **The query's own freshness**: `query(options)`, awaited, or fired and forgotten as `void query(options).catch(() => {})`.

`staleTime: 'static'` is not `Infinity`: `'static'` ignores invalidation too.

## Subscribers

Cache subscribers, not extra stores:

- **Signal handlers** invalidate the queries a signal names, such as memberships or the inbox ([Changes and signals](./SYNC_ENGINE.md#changes-and-signals)).
- **Enrichment** adds to every cached channel row the current user's `membership`, a `can` map with a permission per action ([Frontend map](./PERMISSIONS.md#frontend-map)), and `ancestorSlugs` for URLs. It never replaces backend permission checks.
- **Unseen counts**: sync-delivered rows bump badge counts ([Unseen tracking](./SYNC_ENGINE.md#unseen-tracking)).

## Mutations

A mutation, declared in its entity's query module, patches every cached query holding the row, sends the request, then merges the row the server stored. On error it rolls back. Queries and mutations run in `offlineFirst` network mode.

Offline queueing, replay registration, and per-tab queues: [Writes](./SYNC_ENGINE.md#writes), [Paused writes](./SYNC_ENGINE.md#paused-writes), [Multiple tabs](./SYNC_ENGINE.md#multiple-tabs).

## Files and blobs

An attachment row is an ordinary product in the query cache, while its bytes live in the per-user database's `blobs` table and never enter the query cache. Uploads are stored locally first, downloads follow the cached rows within the device's offline files tier, and components resolve a display URL from the local blob first: [Attachment module](../frontend/src/modules/attachment/README.md).

## The persister

The persister snapshots the cache into the per-user database and restores it on boot. Each product query is its own record, so unchanged lists are not rewritten. Paused mutations are persisted too ([Paused writes](./SYNC_ENGINE.md#paused-writes)). Opt out with `meta: { persist: false }`.

Every user works offline: all tabs share one cache that survives tab and browser restarts, and sign-out deletes it with the rest of the per-user database. Two version stamps guard every restore. Read [Schema evolution](./SCHEMA_EVOLUTION.md) before changing a cached wire shape.

## The per-user database

One Dexie database per signed-in user, `${appConfig.slug}:${userId}`, holds everything durable:

| Table | Contents |
| --- | --- |
| `kv` | Per-user Zustand stores: seen state, sync cursors, navigation, drafts, and stores an app adds |
| `queries` and `meta` | Persisted query records, paused mutations, version stamps |
| `blobs` | Attachment bytes: uploads pending sync and cached downloads |
| `downloadQueue` | Background download work |
| `failedSync` | Queued mutations that can never replay, kept for export and manual repair |
| `yDocs`, `yDocStates`, `yDocUpdates` | Collaborative documents the user opened for editing, so they open from storage and stay editable offline: a trimmed state plus the updates no server has confirmed yet. Old documents are evicted, never one with unsaved edits |
| `unsaveableYDocs` | Edits that can no longer be saved (access lost, entity deleted), kept until the user copies or discards them |

The database follows authentication, not routes: signing in binds it, sign-out deletes it (after asking when it holds edits no server has), and involuntary session loss only closes it, so offline work survives signing back in. Signing out in one tab signs out every tab of that user.

## Cold start to live

Boot order, cached data first:

1. Bootstrap stores hydrate from `localStorage`, identifying a returning user before any request.
2. The app route waits until the per-user database is bound and its stores hydrated, sync cursor included.
3. The persister restores the cache scope.
4. One tab is elected leader, performs catchup, and owns the live connection. Paused mutations resume after it ([Writes](./SYNC_ENGINE.md#writes)).
5. Route loaders fill the current view. A background fill then loads each list not cached yet, the current organization's first, then the other organizations'. From then on catchup keeps them fresh.
