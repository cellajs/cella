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

- **Channel entity lists and details** (`[organization, 'list', ...]`): plain queries, refetched on membership or channel notifications.
- **Canonical product lists** (`[attachment, 'list', org, home]`): one flat, complete list per home channel (the deepest channel a row belongs to), patched by live updates. Components narrow it with `select()`.
- **Filtered product lists**: server-side search and sort results under their own keys. They are invalidated, not patched.
- **Session queries**: `me`, memberships, invites, unseen counts.

Each entity module registers its query keys and delta fetch once in its `query.ts`, so generic cache and realtime code never import entity modules. Staleness follows the stream ([Freshness](./SYNC_ENGINE.md#freshness)). Sync deliveries are plain cache writes: upserts or invalidations.

## Subscribers

Cache subscribers, not extra stores:

- **Enrichment** adds to every cached channel row the current user's `membership`, a `can` map with a permission per action, and `ancestorSlugs` for URLs. It never replaces backend permission checks.
- **Unseen counts**: sync-delivered rows bump badge counts. An exact server recount replaces the estimate on staleness and after catchup.

## Mutations

A mutation patches the cache optimistically, sends the request, then reconciles with the server response. On error it rolls back. Queries and mutations run in `offlineFirst` network mode.

Offline queueing, replay registration, and per-tab queues: [Writes](./SYNC_ENGINE.md#writes), [Paused writes](./SYNC_ENGINE.md#paused-writes), [Multiple tabs](./SYNC_ENGINE.md#multiple-tabs).

## Files and blobs

The attachment row is an ordinary product entity in the query cache. The bytes live in the per-user database's `blobs` table, one record per variant (`raw`, `original`, `converted`, `preview`, `thumbnail`). `raw` is the unprocessed upload and never leaves the device.

- **Uploads store locally first.** The raw blob and an optimistic row are written at once. With cloud upload configured the file enters the processing pipeline. Offline it waits and a background service retries with backoff. Without cloud storage it stays local.
- **Downloads follow the cache.** Every cached attachment row enters the `downloadQueue` table. A scheduler fetches a few files at a time within a storage budget, smallest variant first, and evicts the raw blob once a durable variant exists. Knobs: `appConfig.localBlobStorage`.
- **Components never query blobs.** They resolve a display URL, local blob first and cloud URL otherwise, and queue a background download so the next view is local. Blob bytes never enter the query cache.

## The persister

The persister snapshots the cache into the per-user database and restores it on boot. Each product query is its own record, so unchanged lists are not rewritten. Channel queries and version stamps share one meta record per scope. Paused mutations are stored per tab. Opt out with `meta: { persist: false }`.

| Mode | Scope | Lifetime | Background coverage |
| --- | --- | --- | --- |
| **Session** (`offlineAccess=false`) | One `s-<uuid>` scope per tab | Survives reload. Scopes of closed tabs are swept on a later startup | Current route and channel on demand |
| **Offline** (`offlineAccess=true`) | Shared `rq` scope | Survives tab and browser restarts | Current channel first, then other accessible channels |

Two version stamps guard every restore. Read [Schema evolution](./SCHEMA_EVOLUTION.md) before changing a cached wire shape.

## The per-user database

One Dexie database per signed-in user, `${appConfig.slug}:${userId}`, holds everything durable:

| Table | Contents |
| --- | --- |
| `kv` | Per-user Zustand stores: seen state, sync cursors, navigation, drafts, and stores an app adds |
| `queries` and `meta` | Persisted query records, paused mutations, version stamps |
| `blobs` | Attachment bytes: uploads pending sync and cached downloads |
| `downloadQueue` | Background download work |
| `failedSync` | Replayed offline mutations quarantined after a 4xx error, for export and manual repair |

The database follows authentication, not routes: signing in binds it, sign-out deletes it, and involuntary session loss only closes it, so offline work survives signing back in.

## Cold start to live

Boot order, cached data first:

1. Bootstrap stores hydrate from `localStorage`, identifying a returning user before any request.
2. The app route waits for `localUserStorageReady()`: the per-user database is bound and its stores hydrated, sync cursor included.
3. The persister restores the cache scope.
4. One tab is elected leader, performs catchup, and owns the live connection. Paused mutations resume after that catchup.
5. Route loaders fill the current view. Background fill freshens the current organization's lists, other organizations with offline access.
