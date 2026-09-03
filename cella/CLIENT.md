# Client (React)

This document explains the client's central object: the query client that holds server data in the
browser, plus the services that read and update it.

### TL;DR

Every tab runs one query client. API requests fill it, live updates patch it, background services subscribe to it, and a persister writes selected parts to a per-user database. Even file downloads start from what appears in it. **The query client is where all server data comes together**.

## Bigger picture

Five state owners; this document unpacks the query client, [Architecture](./ARCHITECTURE.md) the surrounding system. `localUserDb` is the per-user database described [below](#the-per-user-database).

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
- **Canonical product lists** (`[attachment, 'list', org, home]`): one flat, complete list per home channel, the deepest channel a row belongs to, patched by live updates; components narrow it with `select()`.
- **Filtered product lists**: server-side search and sort results under their own keys; invalidated, not patched.
- **Session queries**: `me`, memberships, invites, unseen counts.

Each entity module registers its query keys and delta fetch once in its `query.ts`; generic cache and realtime code look entities up there, so sync code never imports entity modules. Staleness follows the stream ([Freshness](./SYNC_ENGINE.md#freshness)); sync deliveries are plain cache writes: upserts or invalidations.

## Subscribers

Cache subscribers, not extra stores:

- **Enrichment** watches channel entity lists, details, and the membership list and adds per row: the current user's `membership`, a `can` map for interface affordances, and `ancestorSlugs` for URLs. Membership runs first because the other two read it. It re-runs on membership or channel-query changes, ignores its own writes, and never alters the API shape or replaces backend permission checks.
- **Download feeding**: the attachment download service queues every persisted attachment row that appears in list queries, so visible files become available offline ([Files and blobs](#files-and-blobs)).
- **Blob cleanup**: the same service watches the mutation cache; a successful attachment delete removes matching local blobs and queue rows.
- **Unseen counts**: sync-delivered rows bump badge counts in the cache; an exact server recount replaces the estimate when the count query goes stale and after every catchup.

## Mutations

A mutation patches the cache optimistically, sends the request, then reconciles with the server response; on error it rolls back. Queries and mutations run in `offlineFirst` network mode.

Offline queueing, replay registration, and per-tab queues: [Writes](./SYNC_ENGINE.md#writes), [Paused writes](./SYNC_ENGINE.md#paused-writes), [Multiple tabs](./SYNC_ENGINE.md#multiple-tabs).

## Files and blobs

The attachment metadata row is an ordinary product entity in the query cache; the bytes live in the per-user database's `blobs` table, keyed per variant (`raw`, `original`, `converted`, `preview`, `thumbnail`). `raw` is the unprocessed upload and exists locally only.

**Uploads store locally first.** Adding a file mints the attachment id, stores the raw blob, and inserts an optimistic row. With cloud upload configured and online, the file enters the processing pipeline; offline, the blob waits as pending and a background upload service retries on a timer and on reconnect, with backoff. Without cloud storage the blob stays local.

**Downloads follow the cache.** Every cached attachment row is enqueued in the `downloadQueue` table; a scheduler downloads a few files at a time within a storage budget, fetching variants smallest first (thumbnail, preview, converted, original) and evicting the raw blob once a durable variant exists. Knobs: `appConfig.localBlobStorage`.

**Components never query blobs.** They resolve a display URL: local blob first (object URL), cloud URL otherwise, queueing a background download so the next view is local. Upload badges read the blob table reactively; blob bytes never enter the query cache.

## The persister

The persister snapshots the cache into the per-user database and restores it on boot. Each product query is its own record, so unchanged lists are not rewritten; channel queries and version stamps share one meta record per scope; each tab's paused mutations get a record of their own, so no tab overwrites another's queue. Opt out with `meta: { persist: false }`.

| Mode | Scope | Lifetime | Background coverage |
| --- | --- | --- | --- |
| **Session** (`offlineAccess=false`) | One `s-<uuid>` scope per tab | Survives reload; scopes of closed tabs are swept on a later startup | Current route and channel on demand |
| **Offline** (`offlineAccess=true`) | Shared `rq` scope | Survives tab and browser restarts | Current channel first, then other accessible channels |

Two version stamps guard every restore. A `clientCacheVersion` mismatch wipes cached queries but keeps paused mutations to replay against the fresh cache. A schema version behind the bundle triggers the boot lens migration; one ahead of it stops persisting rather than downgrade newer data. See [Schema evolution](./SCHEMA_EVOLUTION.md) before changing a cached wire shape.

## The per-user database

One Dexie database per signed-in user, `${appConfig.slug}:${userId}`, holds everything durable:

| Table | Contents |
| --- | --- |
| `kv` | Per-user Zustand stores: seen state, sync cursors, navigation, drafts, alerts, board, plus stores an app adds |
| `queries` and `meta` | Persisted query records, paused mutations, version stamps |
| `blobs` | Attachment bytes: uploads pending sync and cached downloads |
| `downloadQueue` | Background download work |
| `failedSync` | Mutations quarantined after a 4xx error, for export and manual repair |

The database follows authentication, not routes: signing in binds it and hydrates its stores (a switch closes the previous one first); sign-out deletes it; involuntary session loss only closes it, so offline work survives signing back in; impersonation never binds the impersonated user's database.

## Cold start to live

Boot order (cached data first, never an empty-cursor connection):

1. Bootstrap stores hydrate from `localStorage`, identifying a returning user before any request.
2. The app route waits for `localUserStorageReady()`: the per-user database is bound and its Zustand stores are hydrated, sync cursor included. Consumers read `getLocalUserDb()` and tolerate `null`.
3. The persister restores the cache scope (replay defaults are already registered).
4. One tab is elected leader, performs catchup, and owns the live connection; paused mutations resume after that catchup.
5. Route loaders fill the current view; background fill freshens the current organization's lists, other organizations with offline access.

## Tabs and upgrades

The service worker precaches the app shell and caches docs and grammar chunks at runtime, never API responses. Leader election and old tabs after a deploy: [Multiple tabs](./SYNC_ENGINE.md#multiple-tabs) and [Schema evolution](./SCHEMA_EVOLUTION.md).
