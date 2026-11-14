# Client (React)

This document explains the [TanStack Query](https://tanstack.com/query/latest) client that holds server data in the browser, and the services around it.

### TL;DR

Every tab runs one query client. API requests fill it, live updates patch it, background services subscribe to it, and a persister writes selected parts to a per-user database. Even file downloads start from what appears in it. **The query client is where all server data comes together**.

## Bigger picture

Five state owners. `localUserDb` is the per-user database described [below](#the-per-user-database).

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
   blob cleanup       kv)                (blobs table)
```

## Inside the cache

- **Channel entity lists and details**: plain queries, refetched on membership signals.
- **Canonical product lists**: one complete list per [home channel](./SYNC_ENGINE.md#selective-sync), patched live, narrowed with `select()`.
- **Filtered product lists**: server-side search and sort results. A new row marks them for a refetch.
- **Session queries**: `me`, memberships, invites, unseen counts.

Generic cache and realtime code never import entity modules: each one registers its query keys and range fetch once in its `query.ts`. Staleness follows the stream. Sync deliveries are plain cache writes: upserts, or a [refetch mark](./SYNC_ENGINE.md#freshness) on a list they cannot patch.

A synced list read belongs to the cache, not to the screen that started it. A screen that leaves never aborts it.

### Imperative reads

Imperative reads use only `queryClient.query()` and `queryClient.infiniteQuery()`, in two modes:

- **Cache-first**: `query({ ...options, staleTime: 'static' })` fetches only a cold entry.
- **Own freshness**: `query(options)`, awaited or fired as `void query(options).catch(() => {})`.

Route guards and the seeds of channel and session queries read cache-first.

## Subscribers

Cache subscribers, not extra stores:

- **Signal handlers** invalidate the queries a signal names, such as memberships or the inbox.
- **Enrichment** adds `ancestorSlugs` for URLs to every cached channel row.
- **Unseen counts**: sync-delivered rows bump badge counts.

A cached row carries no membership or permission. A reader asks the engine through `useCan`, which reads `meKeys.memberships` ([Permissions](./PERMISSIONS.md#in-the-interface)).

## Mutations

A mutation lives in its entity's query module. It patches every cached query that holds the row, then sends the request. It takes the row the server stored, or rolls back on error. Queries and mutations run in `offlineFirst` network mode.

A write with an `stx` retries a network failure until the server answers. The server applies it once by its ids, and an answer lost on the way back must not report an applied write as failed. Other writes retry a network failure three times.

## Files and blobs

An attachment row is an ordinary product in the query cache. Its bytes live in the per-user database's `blobs` table and never enter the query cache. The [Attachment module](../frontend/src/modules/attachment/README.md) works from that table:

- **Uploads** are stored locally first.
- **Downloads** follow the cached rows, within the device's offline files tier.
- **Display URLs** resolve from the local blob first.

## The persister

Every user works offline. All tabs share one cache that survives tab and browser restarts. Two version stamps guard every restore. Read [Schema evolution](./SCHEMA_EVOLUTION.md) before changing a cached wire shape.

The persister snapshots the cache into the per-user database and restores it when the database binds. A refetch that gets no response or a server error keeps the last data on disk, restored marked.

Paused mutations are persisted too. A running write is persisted only when it carries an `stx`. One cut off by a closed tab or a reload is then sent again as a replay.

A query opts out with `meta: { persist: false }`.

## The per-user database

One Dexie database per signed-in user, `${appConfig.slug}:${userId}`, holds everything durable:

| Table | Contents |
| --- | --- |
| `kv` | Per-user Zustand stores: seen state, sync cursors, navigation, drafts, and stores an app adds |
| `queries` and `meta` | Persisted query records, paused mutations, version stamps |
| `blobs` | Attachment bytes: uploads pending sync and cached downloads |
| `downloadQueue` | Background download work |
| `yDocs`, `yDocStates`, `yDocUpdates` | Collaborative documents the user opened for editing, which stay editable offline. Eviction never drops one with unsaved edits |
| `unsaveableYDocs` | Edits that can no longer be saved, kept until the user copies or discards them |

The database follows authentication, not routes:

- **Sign-in** binds it.
- **Sign-out** ends the session on the server, then deletes it, after asking when it holds edits no server has.
- **A lost session** only closes it, so offline work survives signing back in.
- **A load** deletes the database of every user but the signed-in one and the last one.

Only the server's answer decides a sign-out. A step on the device that does not answer in time is skipped, and a database another tab still holds open is deleted at the next load.

Signing out in one tab signs out every tab of that user. A tab whose signed-in user changes in another tab reloads before it resumes queued writes. Those writes stay on disk for their user's next session, until another user signs in on this browser.

## Cold start to live

Boot order, cached data first:

1. Bootstrap stores hydrate from `localStorage`, identifying a returning user before any request.
2. The app route waits until the per-user database is bound, its stores hydrated and the cache restored from it. A database that does not answer in time is closed: the tab runs online without it until its next load.
3. The app reads the memberships, so the first catchup declares every organization.
4. One tab is elected leader. It performs catchup and owns the live connection.
5. Paused mutations resume after catchup and whenever the app comes back online or regains focus.
6. Route loaders fill the current view.
7. A background fill loads every uncached list and every marked synced list, current organization first.
9. From then on catchup keeps the synced lists fresh.
