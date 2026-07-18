# React Client

Build a conventional React feature and Cella makes it live, restartable, and offline-capable
without giving it a second data model. The generated OpenAPI client fetches data, TanStack Query
owns it in memory, realtime updates the same cache, and IndexedDB can restore that cache later.

The central idea is simple: **offline and realtime are durability and delivery around the ordinary
query cache, not separate application modes.**

## One data path

```text
routes and components
        │
        ▼
feature query options
        │
        ▼
TanStack Query cache ── query/mutation ─▶ generated SDK ── HTTP ─▶ API
        ▲                                                        │
        └────────────────── rows and deltas ◀────────────────────┘
        ▲
        │ restore/persist
        ▼
per-user appdb (IndexedDB)

PostgreSQL change ─▶ API live notification ─▶ registered delta query
                                                   └─ triggers the same SDK path
```

The server remains authoritative. IndexedDB is a durable copy of selected client data, not a
browser database that feature code queries as an alternative backend. Most product create/update
notifications trigger an ordinary API range fetch; membership and deletion events invalidate or
remove data through the same query layer.

That keeps one place to inspect when the interface looks wrong: the TanStack Query cache.

## One runtime owner for each kind of state

| State kind | Runtime owner | Persistence |
|---|---|---|
| Shareable navigation and view state | TanStack Router | URL and browser history |
| Server entities and resources | TanStack Query | Selected queries in per-user `appdb` |
| Signed-in client state | Zustand | Per-user `appdb` key/value records |
| Bootstrap user and UI preferences | Zustand | `localStorage`, available before `appdb` opens |
| App shell and static assets | Browser | Service-worker Cache Storage |

The boundary is more important than the library names:

- Do not mirror server entities into Zustand. Components should derive them from queries.
- Do not use React context as an application store. Reserve it for tree-local component wiring or
  providers required by a library.
- Do not use the service worker as an API response cache. Structured offline data belongs to
  TanStack Query and `appdb`.
- Keep tenant, channel, and entity scoping inside persisted state values. The database name already
  supplies the user boundary.

## From cold start to live app

The startup sequence is designed to show useful cached data early without connecting the stream
with an empty cursor:

1. On a cold boot or reload, the user and UI bootstrap stores hydrate from `localStorage`. This
   identifies a returning user before a `/me` request succeeds, including while offline.
2. The storage lifecycle binds one IndexedDB database named `${appConfig.slug}:${userId}` and
   hydrates the signed-in user's persisted Zustand stores.
3. `PersistQueryClientProvider` restores the active query-cache scope. While no real user is bound,
   persistence is a no-op and queries remain in memory.
4. The authenticated route waits for app storage, then stream coordination elects one leader tab.
   That tab performs catchup and owns the server-sent events (SSE) connection.
5. Restored paused mutations become eligible to resume after the first active catchup attempt.
   Network failures can pause; settled HTTP errors do not become an offline queue.
6. Route loaders and queries fill the current view. With offline access enabled, background sync
   can also prepare the user's other accessible channels for later use.

This is the boot lifecycle. Sequence cursors, scheduling, retries, and replay guarantees belong to
the [Sync engine](./SYNC_ENGINE.md).

## How feature data flows

Each frontend feature module owns its query options, keys, and mutations, usually in
`frontend/src/modules/<module>/query.ts`. Query functions call the generated `sdk` package, so the
browser uses the same OpenAPI contract as every external client.

Entity modules build consistent keys with `createEntityKeys()` and register them with
`registerEntityQueryKeys()`. Registration lets generic cache and realtime code find a product
type's list, detail, and delta-fetch behavior without importing every feature into the sync layer.

### Canonical and derived lists

A synced product has one **canonical list** for each effective home channel: the flat, complete
list that realtime can safely patch. “Home” means the deepest non-null channel ancestor; an
organization-homed attachment therefore has one canonical list per organization.

Components create narrower views with TanStack Query's `select()` rather than copying the same
entities into another store. A search or sort that must run on the server receives a separate
filtered key. Such filtered lists can opt out of persistence and are invalidated when a realtime
change cannot be spliced into them safely.

This convention gives the sync layer an unambiguous merge target while feature components retain
ordinary query ergonomics.

### Mutations and enrichment

Mutations optimistically patch the relevant cache entries, send an OpenAPI request, and reconcile
with the authoritative response. Modules also register replay defaults because functions cannot
be serialized into IndexedDB; persisted mutation variables must contain the route and scope IDs
needed after a reload.

A cache subscriber enriches channel entity lists with three frontend conveniences:

1. the current user's membership;
2. a permission map for interface affordances;
3. ancestor slugs for URLs.

The enrichment is derived from cached data. It does not alter the API shape or replace backend
permission checks.

## Browser durability

Every real signed-in user gets one Dexie database. A user ID in the database name makes cross-user
separation structural and gives sign-out one boundary to erase.

| Area | What `appdb` keeps |
|---|---|
| `kv` | Per-user Zustand stores such as navigation, drafts, seen state, and sync cursors |
| Query records and metadata | Persisted query results, paused mutations, cache and schema versions |
| Blob and download tables | Attachment bytes and background download work |
| Failed sync | Sync mutations quarantined after a 4xx client error |

Product queries are stored as individual records so unchanged queries need not be rewritten.
Smaller context and non-product queries share a metadata record with dehydrated mutations. Queries
can opt out through their metadata, so persistence is an architectural capability rather than a
promise that every request is available offline.

The database follows authentication deliberately:

- Signing in opens or rebinds the user's database and hydrates its stores.
- Switching accounts closes the previous database before opening the next one.
- Explicit sign-out deletes the database, which is safer on a shared device.
- Involuntary session loss closes but preserves it. Per-user Zustand values rehydrate after the
  same user signs in; restoring persisted queries and paused mutations currently requires a reload.
- Impersonation stays ephemeral and does not bind the impersonated user's durable database.

### Session and offline scopes

Both persistence modes live inside the same per-user IndexedDB. They differ in lifetime and how
much data background sync prepares.

| Mode | Scope | Lifetime | Background coverage |
|---|---|---|---|
| **Session** (`offlineAccess=false`) | One `s-<uuid>` scope per tab | Best-effort tab lifetime; unload cleanup may run on refresh or close, with abandoned scopes swept later | Current route/channel on demand |
| **Offline** (`offlineAccess=true`) | Shared `rq` scope | Survives tab and browser restarts | Current context first, then other accessible contexts |

Durable reads and durable writes are related but distinct. Enabling offline access retains more
query data. Paused-write durability is currently best-effort: the mutation needs serializable
variables and a registered replay function, only the leader tab is eligible to persist it on app
routes, and the shared scope is not a transactional multi-tab queue.

## PWA, tabs, and upgrades

The service worker makes the application shell loadable without a network and caches selected
static documentation assets. It does not cache API responses; TanStack Query persistence and the
blob tables own structured data and attachment bytes.

Where Web Locks are available, one authenticated tab holds the server-sent events (SSE) connection
and BroadcastChannel forwards notifications to followers. Without Web Locks, each tab falls back
to its own connection. All tabs still use their own in-memory TanStack Query cache and may initiate
writes. The detailed convergence and persistence limits are documented under
[multiple tabs in the sync engine](./SYNC_ENGINE.md#multiple-tabs).

Persisted clients do not all upgrade at once. The durable offline scope can migrate cached entities
and paused mutation variables before hydration; incompatible session scopes are discarded. A
client that discovers newer on-disk data stops persisting instead of downgrading it. Read
[Schema evolution](./SCHEMA_EVOLUTION.md) before changing a cached entity's wire shape.

## Extension rules

When adding or changing a feature, preserve these seams:

1. Put server data in TanStack Query and client-owned state in Zustand.
2. Give each synced product scope one canonical home list; derive local views from it.
3. Register entity keys and a delta fetcher so generic realtime code can find the feature.
4. Include every route and scope ID a paused mutation needs in its serializable variables.
5. Opt filtered, transient, or unsafe-to-restore queries out of persistence.
6. Put new per-user durable Zustand stores behind `idbKvStorage()` and register their hydration in
   `app-storage.ts`.

The end-to-end entity recipe is in [New entity](./ADD_ENTITY.md).

## Code map

| Location | Responsibility |
|---|---|
| `frontend/src/query/query-client.ts` | Query defaults, retry boundary, and cache lifecycle |
| `frontend/src/query/provider.tsx` | Persistence restoration and mutation replay coordination |
| `frontend/src/query/basic/` | Keys, canonical-query registration, optimistic cache helpers |
| `frontend/src/query/realtime/` | Leader election, stream connection, catchup, and cache patching |
| `frontend/src/query/offline/` | Mutation metadata, retries, replay, and failed-sync handling |
| `frontend/src/query/app-db.ts` | Per-user IndexedDB schema and binding |
| `frontend/src/query/persister.ts` | Session/offline scopes and incremental query persistence |
| `frontend/src/query/enrichment/` | Membership, permission, and ancestor-slug derivation |
| `frontend/src/modules/<module>/query.ts` | Feature-owned queries, keys, and mutations |
| `sdk/gen/` | Generated client and types; never edit by hand |

Continue with the [Sync engine](./SYNC_ENGINE.md) for delivery guarantees, the
[Permissions guide](./PERMISSIONS.md) for the `can` model, and
[Schema evolution](./SCHEMA_EVOLUTION.md) for durable-cache upgrades.
