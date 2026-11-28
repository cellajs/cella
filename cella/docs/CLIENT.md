# Client (React)

This document explains how each tab holds server data in a [TanStack Query](https://tanstack.com/query/latest) client, keeps it offline in a per-user [Dexie](https://dexie.org/) database, boots from it and ends its session.

### TL;DR

Every tab runs one query client. API requests fill it, live updates patch it, subscribers react to it, and a persister writes selected parts to a per-user database. Even file downloads start from what appears in it. **The query client is where all server data comes together**.

## Bigger picture

The browser holds five kinds of state. When you add state, it goes where its kind lives. `localUserDb` is the per-user database described [below](#the-per-user-database).

| State kind | Held by | Persisted in |
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

Every screen reads its server data from the query cache, which holds four kinds:

- **Channel entity lists and details**: plain queries, refetched on membership signals.
- **Canonical product lists**: one complete list per home channel, the channel its rows sit directly in, patched live, narrowed with `select()`.
- **Filtered product lists**: server-side search and sort results. A new row marks them for a refetch.
- **Session queries**: `me`, memberships, invites, unseen counts.

A cached row carries no membership or permission. To decide what the interface shows, ask the permission engine through `useCan`, which reads `meKeys.memberships` ([Permissions](./PERMISSIONS.md#in-the-interface)).

You register an entity's query keys and range fetch once, in its module's `query.ts`. Generic cache and realtime code never import entity modules.

Synced queries stay fresh while the stream is healthy. What the sync engine delivers is a plain cache write: an upsert, or a [refetch mark](./SYNC_ENGINE.md#freshness) on a list it cannot patch.

A synced list read belongs to the cache, not to the screen that started it. A screen that leaves never aborts it.

### Imperative reads

A read outside a hook uses only `queryClient.query()` and `queryClient.infiniteQuery()`, in two modes:

- **Cache-first**: `query({ ...options, staleTime: 'static' })` fetches only an entry that holds no data.
- **Own freshness**: `query(options)` fetches an entry its `staleTime` counts as stale, awaited or fired as `void query(options).catch(() => {})`.

Route guards and the seeds of channel and session queries read cache-first.

## Subscribers

A feature that follows server data keeps no store of its own. It reacts to what reaches the cache:

- **Enrichment** adds `ancestorSlugs` for URLs to every cached channel row.
- **Unseen counts**: sync-delivered rows bump badge counts.
- **Blob cleanup** clears a locally stored upload once the cache holds its uploaded row.

Signal handlers work the other way: they invalidate the queries a signal names, such as memberships or the inbox.

## Mutations

A mutation shows an edit before the server answers. You define it in its entity module's `query.ts`. It patches every cached query that holds the row, then sends the request. It takes the row the server stored, or rolls back on error.

A write with an `stx` ([Sync engine](./SYNC_ENGINE.md#selective-sync)) retries a network failure until the server answers. Say a new attachment's create reaches the server and the connection drops before the answer returns. Giving up would roll back a row the server stored. The server finds that row by its id and answers the retry with it. Other writes retry a network failure three times.

## Files and blobs

An attachment row is an ordinary product in the query cache. Its bytes live in the per-user database's `blobs` table and never enter the query cache. The [Attachment module](../../frontend/src/modules/attachment/README.md) works from that table:

- **Uploads** are stored locally first.
- **Downloads** follow the cached rows, as far as the device's offline files setting allows.
- **Display URLs** resolve from the local blob first.

## The persister

The persister lets every user work offline. It snapshots the query cache into the per-user database and restores it when the database binds. All tabs share that stored cache, and it survives tab and browser restarts.

A refetch that gets no response or a server error keeps the last data on disk, and the restore marks it for a refetch.

Two version stamps guard every restore. Before you change a cached wire shape, read [Schema evolution](./SCHEMA_EVOLUTION.md).

Paused mutations are persisted too. A running write is persisted only when it carries an `stx`. One cut off by a closed tab or a reload is then sent again as a replay.

You opt a query out with `meta: { persist: false }`.

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

Signing out in one tab signs out every tab of that user. A tab whose signed-in user changes in another tab reloads before it resumes queued writes. Those writes stay on disk for their user's next session, until another user signs in on this browser.

Every persisted store says where it lives, or a session end misses it and the store outlives its user. A `localStorage` store's name starts with `${appConfig.slug}-`. A per-user store is listed in `localUserStores`, or in `extraLocalUserStores` for your app's own.

## Ending a session

A session ends on a device in the five ways of the table below. Each goes through one function, `endSession(reason)` in `frontend/src/modules/auth/end-session.ts`, and five rules hold for all of them:

1. A stored user is live until a lost session's 401 says otherwise, on any page.
2. The server ends the session before the browser forgets anything.
3. The query cache and the queued writes leave memory before anything waits. Collaborative edits are stored before the database closes.
4. Ending a session loads a page. Only signing in happens in place.
5. The only databases on this device are the stored user's and the last user's.

The **user hint** tells a tab who is signed in before any request answers: the stored `user` and `lastUser` in `localStorage`.

| Reason | When | Server | Database | Hint | Then |
| --- | --- | --- | --- | --- | --- |
| `sign-out` | The sign-out page, after it asks about unsaved edits | Ends the session first. A 401 counts as done | Deleted | Both forgotten | Loads `redirect`, else the about page |
| `lost` | A lost session's 401 | None | Kept. Anonymous: deleted | `user` forgotten. Anonymous: both | A page that needs an account loads sign-in with the way back (anonymous: the about page). Any other page loads again |
| `elsewhere` | Another tab stored another user, or none | None | Closed | Untouched: the other tab wrote it | Loads the page again |
| `expired` | At load, an anonymous session past its expiry | None | Deleted | Both forgotten | Stays: nothing has rendered yet |
| `replaced` | `/me` names another user than the live one | None | Kept | `user` forgotten | Loads the page again |

## Cold start to live

A tab boots from cached data first, then goes live, in eight steps:

1. Bootstrap stores hydrate from `localStorage`, identifying a returning user before any request.
2. The app route waits until the per-user database is bound, its stores hydrated and the cache restored from it. A database that does not answer in time is closed: the tab runs online without it until its next load.
3. The app reads the memberships, so the first catchup covers every organization of the user.
4. One tab is elected the leader tab. It runs catchup and holds the stream.
5. Paused mutations resume after catchup and whenever the app comes back online or regains focus.
6. Route loaders fill the current view.
7. A **background fill** loads every uncached list and every synced list with a refetch mark, current organization first.
8. From then on the stream keeps the synced lists fresh, and a catchup on each reconnect fetches what it missed.
