# Client (React)

This document unpacks the client's central object: the query client that holds server data in the browser, and everything wired around it.

### TL;DR

Every tab runs one query client. API requests fill it, live updates patch it, background services subscribe to it, and a persister writes selected parts to a per-user database. Even file downloads start from what appears in it. Understand the query client and you understand the client.

## Around the query client

Not everything is server data. The client has five state owners, and the query client is the one this document unpacks:

| State kind | Runtime owner | Persistence |
| --- | --- | --- |
| Shareable navigation and view state | TanStack Router | URL and browser history |
| Server entities and resources | TanStack Query | Selected queries in per-user `appdb` |
| Signed-in client state | Zustand | Per-user `appdb` key/value records |
| Bootstrap user and UI preferences | Zustand | `localStorage`, available before `appdb` opens |
| App shell and static assets | Browser | Service-worker Cache Storage |


The rest of this document walks the query client's anatomy:

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
   enrichment         per-user appdb     download queue
   unseen deltas      (queries, meta,    + blob storage
   blob cleanup       kv, failed sync)   (blobs table)
```

## Inside the cache

The query cache holds a few recurring shapes:

- **Channel entity lists and details** (`[organization, 'list', ...]`): plain queries that invalidate and refetch when a membership or channel notification arrives.
- **Canonical product lists** (`[attachment, 'list', org, home]`): one flat, complete list per home channel. This is the list live updates patch directly; components narrow it with `select()` rather than copying rows into another store.
- **Filtered product lists**: server-side search and sort results under their own keys. When a change cannot be placed in them, they are invalidated rather than patched.
- **Session queries**: `me`, memberships, invites, and unseen counts.

Each entity module registers its query keys and delta fetch once, in its `query.ts`. Generic cache and realtime code look entities up in that registry, so no sync code needs to import entity modules.

Staleness follows the stream: synced product queries stay fresh while the live connection is up and fall back to five minutes without it; other queries default to 30 seconds. How changes are produced and delivered is the [Sync engine](./SYNC_ENGINE.md)'s story; seen from the query client, they are ordinary cache writes that upsert rows or invalidate lists.

## Subscribers

The cache is observable, and several client features are built as cache subscribers rather than as extra stores:

- **Enrichment**: a subscriber watches channel entity lists and details and adds three derived fields to each row: the current user's `membership`, a `can` permission map for interface affordances, and `ancestorSlugs` for building URLs. It runs when memberships change or a channel query updates, short-circuits when nothing changed, and guards against reacting to its own writes. Enrichment is derived from cached data only; it never alters the API shape or replaces backend permission checks.
- **Download feeding**: the attachment download service watches attachment list queries. Every attachment that appears in the cache is queued for background download, so files a user can see become available offline. See [Files and blobs](#files-and-blobs).
- **Blob cleanup**: the same service watches the mutation cache; a successful attachment delete removes the matching local blobs and queue rows.
- **Unseen counts**: rows delivered by sync bump unseen badge counts up or down directly in the cache; an exact server recount periodically replaces the estimate.

## Mutations

A mutation patches the cache optimistically, sends the request, then reconciles with the server response; on error, the optimistic change rolls back. Queries and mutations both run in `offlineFirst` network mode.

Offline writes queue rather than fail. A network failure retries briefly, then pauses the mutation, and paused mutations persist for replay after reload. Server errors never queue; a 4xx during replay is quarantined into the `failed_sync` table so no offline edit is silently lost.

Replay works because of two rules. Functions cannot be persisted, so each entity module registers its mutation functions as defaults at startup, before the cache restores. And persisted variables must carry the ids needed to route the request after a reload. Queued work is also tidied while offline: repeated edits to one entity squash into one update, an edit to a not-yet-created entity folds into its create, and deleting a queued create cancels both.

Each tab persists its own paused-mutation record, with ownership tracked through Web Locks; a restoring tab adopts the records of dead tabs. Replay waits for the first catchup so it runs against fresh data.

## Files and blobs

Attachments show how far the query client reaches, even for binary data. The metadata row is a product entity in the query cache like any other. The bytes live next to the cache, in the `blobs` table of the per-user database, keyed per variant (`raw`, `original`, `converted`, `thumbnail`).

**Uploads store locally first.** Adding a file mints the attachment id up front, stores the raw blob, and inserts an optimistic row into the cache. With cloud upload configured and a connection available, the file then goes through the processing pipeline; offline, the blob waits as pending and a background upload service retries with backoff once connectivity returns. Without cloud storage the blob simply stays local.

**Downloads follow the cache.** Every attachment row that reaches the cache is enqueued in the `downloadQueue` table. A scheduler downloads a few files at a time within a configured storage budget, fetching variants in priority order and evicting the raw blob once a durable variant lands. All knobs live in `appConfig.localBlobStorage`.

**Components never query blobs.** They resolve a display URL: local blob first, served as an object URL, cloud URL otherwise, with a background download queued so the next view is local. Upload status badges read the blob table reactively. Blob bytes never enter the query cache; the cache stays JSON.

## The persister

The persister snapshots the cache into the per-user database and restores it on boot. It writes at two granularities: each product query is its own record, so unchanged lists are not rewritten, while channel queries, paused mutations, and version stamps share one meta record per scope. A query opts out with `meta: { persist: false }`.

Persistence runs in one of two scopes:

| Mode | Scope | Lifetime | Background coverage |
| --- | --- | --- | --- |
| **Session** (`offlineAccess=false`) | One `s-<uuid>` scope per tab | Best-effort tab lifetime; abandoned scopes are swept later | Current route and channel on demand |
| **Offline** (`offlineAccess=true`) | Shared `rq` scope | Survives tab and browser restarts | Current channel first, then other accessible channels |

Two version stamps guard every restore. A `clientCacheVersion` mismatch wipes cached queries but keeps paused mutations, which replay against the fresh cache. A schema version behind the bundle triggers the boot lens migration; a version ahead of the bundle makes the tab stop persisting rather than downgrade newer data. Read [Schema evolution](./SCHEMA_EVOLUTION.md) before changing a cached entity's wire shape.

## The per-user database

Everything durable converges in one Dexie database per signed-in user, named `${appConfig.slug}:${userId}`:

| Table | Contents |
| --- | --- |
| `kv` | Per-user Zustand stores: navigation, drafts, seen state, sync cursors |
| `queries` and `meta` | Persisted query records, paused mutations, version stamps |
| `blobs` | Attachment bytes: uploads pending sync and cached downloads |
| `downloadQueue` | Background download work |
| `failedSync` | Mutations quarantined after a 4xx replay error |

The database follows authentication, not routes:

- Signing in binds the database and hydrates its stores; switching accounts closes the previous one first.
- Explicit sign-out deletes the database, the safe choice on a shared device.
- Involuntary session loss only closes it, so the same user can recover offline work after signing back in.
- Impersonation stays ephemeral and never binds the impersonated user's durable database.

## Cold start to live

Boot is ordered so cached data appears early and the stream never connects with an empty cursor:

1. Bootstrap stores hydrate from `localStorage`, identifying a returning user before any request succeeds, offline included.
2. The storage lifecycle binds the per-user database and hydrates its Zustand stores, including the sync cursor.
3. The persister restores the cache scope; entity modules have already registered their mutation and replay defaults.
4. One tab is elected leader, performs catchup, and owns the live connection.
5. Paused mutations resume after the first catchup.
6. Route loaders fill the current view; a background service then freshens the current organization's lists, and other organizations too when offline access is on.

Cursor mechanics, scheduling, and delivery guarantees belong to the [Sync engine](./SYNC_ENGINE.md).

## Tabs and upgrades

Each tab has its own query client and can write; one leader tab owns the stream and broadcasts notifications to the rest. The service worker keeps the app shell loadable without a network but never caches API responses. When a new version deploys, an old tab that detects newer persisted data stops persisting and prompts for a reload. Details live under [multiple tabs](./SYNC_ENGINE.md#multiple-tabs) in the sync engine and in [Schema evolution](./SCHEMA_EVOLUTION.md).
