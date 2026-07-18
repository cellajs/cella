# Cella sync engine

How product data stays consistent across clients — live, offline, and after weeks away. The first four sections build the model and are meant to be read in order: what the engine is, the example world the whole document uses, the five invariants everything rests on, and one change followed end to end. Every later chapter is a zoom-in on one part of that journey. Wire shapes, counter keys and the glossary live in the [reference](#reference) at the end.

Sibling documents: [Permissions](./PERMISSIONS.md) (the engine that authorizes every row and summary), [CDC worker](../cdc/README.md) (the replication pipeline internals), [Yjs relay](../yjs/README.md) (collaborative text editing), [Add entity](./ADD_ENTITY.md) (wiring a new synced entity), [Schema evolution](./SCHEMA_EVOLUTION.md) (changing shapes without breaking old clients).

## What this is

Cella's sync is **notify-then-fetch** built on the app's own primitives: Postgres, OpenAPI and React Query. A worker watches the database's replication stream and notifies clients that something changed; clients fetch the changed rows through the same list/detail endpoints the rest of the application uses. There is no second data plane — no sync-owned schema, no parallel authorization, no shadow cache.

Sync is opt-in per entity kind:

| Entity type | Features | Example |
|------|--------------|---------|
| `ChannelEntityType` | Standard REST CRUD, server-generated IDs | `organization` |
| `ProductEntityType` | HLC scalar merge, set-like array deltas, paused-mutation persistence infrastructure, app SSE, live cache updates, multi-tab leader election; optional Yjs integration | `attachment` |

Why built-in rather than an external sync service? External engines bring their own patterns for operations, authorization and caching — either everything goes through them, or you live with dual patterns. Internalizing the engine also lets its machinery serve other features: the audit trail, the API event bus, unified count logic, schema-evolution tolerance.

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed | Extends existing endpoints with `stx` object in entity |
| **Authorization** | Requires re-implementing | Reuses `checkPermission()` and existing guards |
| **Schema ownership** | Sync layer dictates patterns | Drizzle/Zod schemas remain authoritative |
| **Opt-in complexity** | All-or-nothing-or-double | Progressive: REST → offline & realtime |
| **React Query** | New reactive layer | Builds on existing TanStack Query cache & hooks |

## The example world

Everything in this document uses one running example: **the campus fork**, a fictional education app built on cella. Its channel hierarchy is `organization → course → section → project`; its product entity is the **item** (a post). Items can be homed at a course (the course wall), at a section, or at a project — deeper ancestor columns are simply null for shallower placements. Items opt into the draft lifecycle (`publishedAt`). Roles are `admin`, `staff` and `member`, with `elevatedRoles: ['admin', 'staff']` — staff read below their grant level, members do not.

The cast: **Maya**, a student — member of course `course7` and of project `proj9`; **Sam**, staff on `course7`; **Ada**, an org admin of `org1`. Paths look like `org1/course7`, `org1/course7/sect3`, `org1/course7/sect3/proj9`.

The template itself ships the minimal case — `organization → attachment`, no drafts, no deep levels. The engine is byte-identical in both: the campus fork is configuration (hierarchy, roles, `publishedColumn`), not different code. When a mechanism only matters at depth, this document says so.

## The model in five invariants

**1. One sequence per organization.** Every product change of every entity type takes the next value of a single monotonic counter per org — the **org sequence** (`sequence` on the org's `channel_counters` row). The CDC worker reserves contiguous ranges post-commit and stamps each row's `seq` column in WAL order, so **commit order is sequence order** across all product types. A freshly created row keeps its schema default until the stamp lands moments later. Maya's item post and Sam's item edit in different projects still get comparable positions in one org-wide order.

**2. Place is a path.** Every channel and product row carries a materialized id-path (`path`, a STORED generated column): root-first ancestor ids, slash-joined; channel rows append their own id (`org1/course7/sect3/proj9`). Any subtree is a path prefix, so "everything under course7" is one `LIKE`-shaped predicate (`pathStartsWith`) — no recursive joins. Ancestry is always derived from ids the database materialized, never from what a client claims (see [Authorization](#authorization-readability--answerability)).

**3. Summaries roll up; frontiers only move forward.** Each node's `channel_counters` row holds per-type summaries. A **frontier** `f:{type}` is the newest sequence position at or below the node — every stamp max-merges it at the org and at every non-null ancestor, so "did anything change under course7?" is one integer comparison at any level. `e:{type}` counts roll up the same way. A parallel **self family** (`fs:{type}`, `es:{type}`) lives at the home node only and describes rows homed exactly there. Frontiers never move backward. Key grammar: **prefixed keys are per-type families** (`f:`, `fs:`, `e:`, `es:`, `li:`, `lu:`, `m:`), **bare keys are org-row singletons** (`sequence`, `membership`).

**4. Clients sync views.** The client's unit of sync is a **view**: `{prefixes, entityTypes, depth, cursor}` — a set of path prefixes plus one org-sequence cursor. A view is behind when its cursor is behind the matching frontier; a **delta fetch** (`?seqCursor=cursor+1` on the ordinary list endpoint) closes the difference, and the cursor advances only after the rows are ingested. Catchup after two weeks offline and a live notification two seconds after the edit are the **same operation** — compare cursor to frontier, fetch the range — at different moments.

**5. The stream contains only the synced world.** A PostgreSQL publication row filter keeps unpublished drafts out of the replication stream entirely: **publish is an insert into the synced world, unpublish is a delete from it, drafts never enter.** Every event that reaches the worker is therefore stamp-worthy and fetchable — no masked-out positions, no unfetchable frontier advances. On top of that, dispatch re-runs the permission engine per subscriber per row, so a notification is only ever seen by someone allowed to read the row it describes.

## One change, end to end

The whole engine in one story. Maya, on the course page, renames her item `i42` (homed in `proj9`) from "Field notes" to "Field notes v2".

**In Maya's tab.** The item module's `query.ts` applies an **optimistic update** to every cached query holding `i42` and squashes any pending mutation for the same row. It then sends the REST mutation:

```
PUT /items/i42
{ ops: { name: "Field notes v2" },
  stx: { mutationId, sourceId, fieldTimestamps: { name: "1710500000123:0001:abcde" } } }
```

`ops` carries the changed fields; `stx` is the sync transaction envelope — who wrote (`sourceId`), which attempt (`mutationId`), and a per-field **HLC timestamp** used for merge arbitration ([Writes](#writes-optimistic-state-and-merge)).

**In the API handler.** `resolveUpdateOps` compares each scalar's incoming HLC with the stored one — older timestamps are dropped, newer ones win — then a plain `UPDATE` runs in the transaction. The response body is the authoritative row; Maya's cache reconciles against it on success.

**In Postgres, then the CDC worker.** The commit lands in the WAL. The worker consumes it through the `cdc_pub` publication and its transaction buffer, then in one batch:

1. persists an **activity** — the append-only audit/history record (`activitiesTable`);
2. reserves the next org-sequence range for `org1` and stamps `seq = 42` onto `i42` (WAL order = sequence order);
3. rolls up counters: frontier `f:item = 42` max-merged at `org1`, `course7`, `sect3` and `proj9`; self family `fs:item`/`lu:item` at the home node `proj9`.

**Over the wire to the API.** The worker sends a **message** on its internal WebSocket (`/internal/cdc`). The API's ActivityBus re-emits it as an in-process **event**: the detail cache drops its `item:i42` entry, and the stream dispatcher takes over.

**Fan-out.** For each SSE subscriber of `org1`, dispatch runs the same `checkPermission` used by list reads — against the full row the event carries. Maya, Sam and Ada all pass. Each connected leader tab receives a **notification**:

```
{ kind: 'entity', action: 'update', entityType: 'item', subjectId: 'i42',
  path: 'org1/course7/sect3/proj9', seq: 42, count: 1, stx, syncWindow, ... }
```

**Back in the tabs.** Maya's tab recognizes its own `stx.sourceId` — an **echo** — and only patches the cached `stx`; her optimistic state already shows v2. Sam's leader tab hands the notification to the **lazy scheduler**: viewing the course page means the live tier (no delay), so it delta-fetches `GET /items?seqCursor=42,42`, upserts the row into the caches, bumps the unseen ledger if the row qualifies, and re-broadcasts the notification to Sam's other tabs over BroadcastChannel.

```
Maya's tab                    Server                              Sam's tabs
────────────                  ──────────────────────────────      ─────────────────
optimistic apply
PUT /items/i42 ─────────────► handler: HLC merge → UPDATE
                              Postgres commit → WAL
                              CDC worker: activity, seq 42,
                                          f:/fs: rollups
                              ── message (WS /internal/cdc) ──►
                              ActivityBus event → dispatch
                              (per-row permission per subscriber)
◄── SSE notification ──────── StreamSubscriberManager ─────────► leader tab
echo: patch stx only                                             scheduler → delta fetch
                                                                 seqCursor=42,42 → patch
                                                                 caches + unseen ledger
                                                                 └─ BroadcastChannel ─► followers
```

**The offline half.** Suppose Maya spent the afternoon on a train. While she was away: item D was posted (`seq 4`), item B was soft-deleted (`5`), item A was edited (`6`), item E was posted (`7`) — her item-view cursor still says `3`. On reconnect, before opening SSE, her client POSTs its **views** to the stream endpoint:

```
{ cursor, views: [ { key, organizationId: 'org1', prefixes: ['org1'],
                     entityTypes: ['item'], depth: 'subtree', cursor: 3 }, ... ] }
```

The server authorizes each prefix, reads the counters, and answers `{ status: 'ok', frontiers: { item: 7 }, counts: ... }`. Cursor 3 < frontier 7, so one delta fetch `GET /items?seqCursor=4` (open-ended) returns D, B, A and E. B carries `deletedAt` — a **tombstone** — so it is removed from the caches; the rest upsert. Only after ingest does the cursor advance to 7. Had this been Maya's first connection, the answer would only have baselined her cursors — route loaders own initial data.

Same comparison, same fetch, same advance rule as the live path. That is the engine.

The four transport terms, once:

| Term | Layer | What it is |
|------|-------|------------|
| **Activity** | Database | Persisted record in `activitiesTable`; append-only audit/cursor history |
| **Message** | CDC worker | JSON payload sent worker → API over the internal WebSocket |
| **Event** | ActivityBus | In-process emission to API-side handlers (Node.js EventEmitter) |
| **Notification** | SSE stream | Lightweight payload delivered to clients |

## Server: producing the ordered truth

### From WAL to messages

The CDC worker consumes logical replication (details: [cdc/README](../cdc/README.md)). `TransactionBuffer` preserves transaction boundaries and suppresses cascaded child deletes; after commit, `FlushBuffer` micro-batches surviving events across transactions, grouped by `(type, action)`. Product groups are then split **per `(path, entityType)`** so every message describes one audience. Because all product types share the org sequence, a group's `seq..batchUntilSeq` range can interleave with other groups' values — the explicit `count` field is authoritative for batch size, never range arithmetic.

The worker channel is internal-only: the API accepts it solely at `/internal/cdc`, requires the shared CDC secret, restricts production sources to loopback or the deployment VPC, permits one connection, and closes idle peers after 90 seconds.

### Sequence stamping and counter writes

Per batch, per organization, the worker reserves a contiguous org-sequence range with one `RETURNING` upsert on `channel_counters.counts['sequence']`, assigns `baseSeq + i + 1` to each product create/update in WAL order, and writes the values back with one bulk `UPDATE ... FROM VALUES` per table (also clearing `stx.changedFields`). Alongside the stamps it writes, per node:

| Key family | Where | Meaning |
|------------|-------|---------|
| `f:{type}` | org + every non-null ancestor | Subtree frontier: max seq at or below the node (max-merge) |
| `fs:{type}` | home node only | Self frontier: max seq of rows homed exactly there |
| `e:{type}` | org + every non-null ancestor | Subtree count of countable rows (live AND published) |
| `es:{type}` | home node only | Self count; reparents move it between homes |
| `li:{type}` / `lu:{type}` | home node only | Last-insert / last-update epoch stamps (per-stream activity signals) |
| `m:{role}` / `m:total` / `m:pending` | membership channel | Membership counts |
| `sequence` / `membership` | org row, bare | The reservation counter / a bump-only membership change signal |

Max-merge keys (`f:`/`fs:`/`li:`/`lu:`) keep the maximum; everything else sums, floored at zero (`apply_count_deltas`). The **home** of a row — its deepest non-null channel ancestor, org fallback — is where self-family keys and activity stamps live, and what audience grouping and unseen counts key on; it no longer scopes sequence allocation. `channel_counters` is current state; `activitiesTable` is history.

### Drafts: the publication row filter

Product tables that opt into the draft lifecycle (`publishedColumn`) carry a row filter in the CDC publication (`WHERE published_at IS NOT NULL`; row filters are a PG 15 feature, and PostgreSQL 17+ is cella's documented floor). Postgres rewrites transitions at decode time:

- **Publish** (old row fails the filter, new passes) arrives as an **INSERT** — the row's sync birth: count +1, `li:` stamp from `publishedAt`, sequence stamp, frontier bump.
- **Unpublish** (old passes, new fails) arrives as a **DELETE** carrying the full old row: count −1, and readers of the old row get the ordinary hard-delete invalidation.
- **Draft creates, edits and deletes** never arrive at all.
- **Soft-deleting a published row** keeps the filter true — tombstones still flow as UPDATEs.

So when Maya drafts an item on the course wall, nothing enters the stream — no stamp, no frontier movement, no signal that she is writing. The moment she publishes, the item is born into the synced world as a create.

Channel tables are never filtered: their `publishedAt` (defaultNow) gates invitees, not replication. A draft that reaches the worker anyway — a fork added `publishedColumn` without regenerating the publication — is dropped by the entrance guard in `parse-message.ts` with a rate-limited warning, and the dispatch draft veto remains as fail-closed defense-in-depth. API reads keep their `publishedRowsPredicate`: the **table** still contains drafts; only the stream does not.

### Moves and move-out

When an update changes a product row's `path` (a reparent — Maya's item moved from `proj9` to the section level), the worker attaches `movedFrom`, the permission-relevant subset of the old row. Dispatch then computes, per subscriber, readability of the old and new locations. Whoever can read both gets the normal `update` and routes the row client-side. Whoever could read only the old location gets **`action: 'moveOut'`** with the OLD path: no delta fetch will ever return this row to them, so the notification itself is the removal — drop from caches and the unseen ledger. One accepted edge: a publish that simultaneously reparents arrives as an INSERT (no old row), so no move-out fires for that combined transition; the affected readers never saw the draft anyway.

### Repair: recalculation

Counter recalculation rebuilds everything derivable from the tables: the org `sequence` (max stamped seq across product tables), `f:`/`fs:` frontiers, `e:`/`es:` counts, `li:`/`lu:` stamps, and the `channel_counters.path` column used for verified ancestry. It applies the same live-and-published predicates as the CDC worker — the two must agree or counters drift on every repair. Rows drafted before the row-filter era may hold historical seq stamps; they are harmless orphans, excluded from frontiers here as everywhere.

### Fan-out cost

Dispatch serializes each notification once and evaluates subscribers against a memoized per-array membership index, so permission checks are O(1) lookups per event. The remaining measured constraints in a very active org (single-process dispatch CPU, an 80-connection pool, no read replica) are absorbed client-side by the negotiated lazy scheduler and the unseen ledger ([Client](#client-views-cursors-fetching)) — the org-wide eager-fetch stampede and per-batch recount storms no longer exist. One connection is registered against the organizations visible when it opens; gaining a new org requires a reconnect.

## Authorization: readability × answerability

Two different questions, two different leak surfaces:

1. **Row readability** — which rows may this user fetch? Answered per row by the permission engine (`checkPermission` / `buildCollectionReadWhere`), identically in list reads, delta fetches, SSE dispatch and the detail cache. Its three directions:
   - **Self**: a membership grant covers rows homed at its channel.
   - **Downstream**: only **elevated roles** (`elevatedRoles` config) reach below their grant level — Sam's course-staff grant reads project items; Maya's course membership does not.
   - **Upstream**: no grant reaches upward; upstream reading exists only through auto-created ancestor memberships and their own home-scoped grants.
2. **Summary answerability** — may the server show this user the aggregate change signal (frontiers, counts) for a view? Rows leak content; summaries leak the **existence and timing** of other people's activity. So `resolveViewReadStatus` demands proof:

> **A direct membership with unconditional read at a node answers that node's SELF view `ok`. A SUBTREE view additionally requires the grant to be subtree-scoped — an elevated role at that node, or the node is the deepest level. Everything readable-but-unproven answers `opaque` (no numbers; live SSE unaffected; catchup falls back to refetch); `forbidden` only without any read scope in the org (anti-oracle: probing prefixes teaches nothing).**

**Ancestry comes from the id, never the claim** (the XACML hierarchical-profile lesson): every `channel_counters` row carries the channel's canonical `path` (CDC-maintained, recalc-backfilled), so the counters read that answers a view also VERIFIES it. A claimed prefix must equal the node's true path — a mismatch (forged, or stale after a reparent) answers `opaque` and self-heals on re-declare; a mismatch never escalates to `forbidden` (anti-oracle — that status remains reserved for callers with no read scope at all) — and grants then match against TRUE ancestor segments, so a subtree grant at any real ancestor proves deeper nodes. Nodes without a counters row fall back to node-id-only proof (conservative, and there are no numbers to disclose anyway).

The campus fork, worked (° = via a direct/auto-created membership with unconditional home read; ᵛ = via a subtree grant at a VERIFIED true ancestor):

| View | Ada (org admin) | Sam (course staff) | section staff | Maya (student + own project) | student only |
|---|---|---|---|---|---|
| course **self** stream (the course wall) | ok | ok | ok° | **ok** | **ok** |
| course **subtree** feed | ok | **ok** | opaque | opaque | opaque |
| section **self** stream | ok | okᵛ | ok | ok° | opaque |
| section **subtree** feed | ok | okᵛ | **ok** | opaque | opaque |
| project stream (leaf: self = subtree) | ok | okᵛ | okᵛ | **ok** | opaque |

Maya's aggregate over "my 3 of the 5 projects" is a view whose prefix SET is her granted nodes — each directly provable, so the union answers `ok`; asking the CONTAINER's prefix instead stays `opaque` for partial readers, by design.

What the statuses feel like: `ok` = exact delta fetches + count-drift checks on catchup; `opaque` = identical LIVE behavior (dispatch is per-row filtered and view-agnostic), one list refetch on catchup instead of a delta fetch; `forbidden` = the view is dropped.

**Grant-boundary views.** Views should be declared where grants live — then every reader's precise views exist by construction. `deriveGrantBoundaryViews` (client) maps grant shapes to provable views: org-wide/elevated grants → subtree views; home-level grants → ONE prefix-set subtree view (the partial-coverage aggregate); home-scoped grants → self views; conditional grants derive nothing (their rows ride org-view fetches + staleness). Registered views (`declareSyncView`) obey the **re-baseline rule**: a view's identity is its prefix set + entity types + depth, and any identity change resets the cursor to 0 — a grown prefix set has history predating the cursor that a delta fetch would silently skip. On catchup, registered `ok` views with an unchanged frontier skip every refetch (the precision win); changed views invalidate and advance; row ingestion itself rides the org-view delta fetches.

> **Consistency note (Zanzibar's "new enemy" lesson).** Authorization state (memberships) and sequence cursors advance independently; cella approximates snapshot-consistency with per-request membership snapshots, live membership refresh before dispatch, and view answers computed against current grants. A fork needing hard guarantees that permission changes order before content changes should look at Zanzibar-style consistency tokens (zookies) — out of scope here by design.

## Client: views, cursors, fetching

Cella exposes one realtime stream: the authenticated app stream (session cookie). Cursors and view baselines persist in the sync store across refreshes; the SSE connection itself is owned by the leader tab ([Multi-tab](#multi-tab-coordination)).

### What arrives

Clients branch on `kind` first. Membership notifications invalidate membership/channel queries; entity notifications enter the sequence sync path with four shapes:

| Shape | Detection | Client behavior |
|-------|-----------|----------------|
| **Single entity** | `seq` set, `batchUntilSeq` null | Range-fetch that seq and patch caches; tombstones remove cached entities |
| **Create/update batch** | `batchUntilSeq` set | Range fetch via `seqCursor=seq,batchUntilSeq`; live rows upsert, tombstones remove |
| **Hard delete** | `action: 'delete'` | Physical delete (rare, e.g. DB admin, unpublish-as-DELETE): invalidate the scoped list to reconcile; soft deletes arrive as `update` tombstones instead |
| **Move-out** | `action: 'moveOut'` | The notification IS the removal: drop the row from caches + unseen ledger (no fetch will ever return it) |

**Echo prevention:** each tab generates a UUIDv7 `sourceId` at load. A non-delete notification whose `stx.sourceId` matches is the tab's own write coming back:

```typescript
if (action !== 'delete' && stx?.sourceId === sourceId) {
  patchEntityStxInCache(entityType, entityId, stx, organizationId);
  return; // Keep the optimistic/server response; only refresh cached stx.
}
```

Deletes are deliberately not echo-skipped (a deleted row's `stx` may identify an earlier writer). The echo returns before the cursor advances, so a later catchup may see that seq again — safe, merely redundant.

### Catchup (Phase A, before SSE opens)

The client POSTs `{ cursor, views }` to the stream endpoint: one org-prefix view per (org, entityType) from `sync-store.getCatchupViews`, plus any registered grant-boundary views. The server authorizes every (prefix, entityType) pair (`resolveViewReadStatus`) and answers per view (`ok` with frontiers + counts, `opaque`/`forbidden` with nothing) plus per-org signals ([wire shapes](#reference)). Then:

- **First connection** (no stored cursor): store the frontier values as baselines and return — route loaders own initial data.
- **`ok` views behind the frontier** with cached lists: ONE org-wide delta fetch per entity type from `cursor + 1` (open-ended `seqCursor`) returns every changed row of that type in the org — child-homed rows included, routed into their lists by cache-ops. A full chunk or a failed fetch falls back to active-list invalidation. The cursor advances only after ingest (**advance-after-ingest**). Background-tier orgs enqueue into the lazy scheduler instead and advance at flush.
- **`opaque` views** invalidate cached active lists (staleness fallback); **`forbidden` views** are dropped.
- Tombstones returned by delta fetches remove rows from detail/list caches.
- Member lists are invalidated only for orgs whose `membership` counter changed; channel lists, `me` and the user's memberships refresh on every non-baseline catchup.
- View `counts` feed the drift check below; embedding propagation runs after all delta fetches.

### Live: the negotiated scheduler

Live list syncing is **lazy and negotiated** — both sides get a say in when a client fetches a notified range, and the outcome is a pure function:

```
delay = clamp(tier.min, hash(sourceId:channelView) % syncWindow, tier.max)
        ^ client floor   ^ deterministic per-client jitter      ^ client ceiling
```

- **Client's say — eagerness tiers** (`getSyncTier`): viewing the channel → `{0,0}` (live); membership `muted`/`archived` → fetch-on-open only; anything else → `{2s,30s}` background. The ceiling is the freshness guarantee: non-muted pages are never more than ~30s stale.
- **Viewing detection** (`isViewingChannel`): the org level reads route context; sub-org channels are derived from the query cache (`observed-channels.ts`) — a channel counts as viewed while a mounted view observes a list query scoped to it. The router cannot answer the sub-org question (routes carry slugs, and a board renders channels its route never names), so detection asks the layer that already knows; prefetches create no observers, unmounting self-corrects. This rides the `createEntityKeys` key contract — channel-scoped list keys carry the channel id positionally (`list.home`) or as a filter value (`list.filtered`). The contract holds by construction; a delivered row that matches no cached list triggers a runtime warning in cache-ops.
- **Server's say — `syncWindow`** on each notification: a spread window scaled by the org's online audience (~20ms/subscriber) and DB pool pressure, capped at 120s, identical for every subscriber (it rides the serialize-once body). Under load the fleet decelerates within seconds — throttling without 429s.
- **Scheduler** (`lazy-sync-scheduler.ts`): every notification — a single is a width-1 batch — enqueues a dirty range per **channel view** (the live bookkeeping unit: one implicit single-prefix view per `{entityType}:{channelId ?? organizationId}`, same cursor-chases-frontier model as declared views). Contiguous ranges merge (a burst becomes ONE fetch), more news never postpones, and the deterministic hash spreads clients instead of stampeding. Flush triggers: due timer, navigating into the channel, a viewed channel gaining its first observer, tab hiding, coming back online.
- **Known vs caught-up**: every notification records the channel view's *known* latest seq (even muted ones — powers catch-up-on-open); the *caught-up* cursor advances only after a successful flush, so small live gaps self-heal (fetches anchor at caught-up + 1). Failures retry with backoff, then fall back to targeted list invalidation + advance so a range can never loop. Catchup resets the scheduler — it recomputes deltas itself.

### Background fill and fallbacks (Phase B)

After SSE reaches `live`, the background sync service runs `ensureQueryData`/`ensureInfiniteQueryData` for entity queries: the current org first after an initial 1s delay (staleness resolves immediately), other orgs only when `offlineAccess` is on (500ms stagger). The older org-level `high`/`low` priority (`getSyncPriority`) survives only for the two paths without synced rows: hard deletes (it selects `active` vs `none` invalidation) and seq-less fallbacks (high fetches the single entity, low marks stale only).

If Phase B doesn't run (SSE failed): module-level `refetchOnMount: true` where configured; global `refetchOnReconnect: true`; pull-to-refresh forces full active refetch.

### Freshness policy

Registered product queries opt into `syncStaleTime`: **Infinity while the stream is live** (catchup + notifications own freshness), **5 minutes while disconnected** (queries refresh on navigation). Non-synced queries keep the global 30s default; with `offlineAccess` on, that global default becomes Infinity while the device is offline. A query-level `syncStaleTime` takes precedence even then.

| Concern | offlineAccess ON | offlineAccess OFF |
|---------|-----------------|-------------------|
| Cache persistence | `appdb` `rq` scope (survives restart) | `appdb` `s-<tab>` scope (survives refresh, cleared on tab close) |
| Global default staleTime while device offline | Infinity | 30s |
| Product `syncStaleTime` | Infinity live; 5 min otherwise | Infinity live; 5 min otherwise |
| Product entity sync (current org) | Yes | Yes |
| Phase B cache fill (other orgs) | Yes | No; module mount/refetch policy applies |
| Membership live/catchup refresh | Yes | Yes |
| Member queries in Phase B | Included | Not included |

### Count-drift integrity check

Catchup's view `counts` are shared server totals, while cached lists can be permission-filtered — so they are **never compared with cached list totals**. Instead the client remembers the last server count per (org, entity, channel) for this browser session; a later catchup reporting a different count while a list is cached invalidates the active list:

```typescript
const previous = lastSeenServerCounts.get(countKey);
lastSeenServerCounts.set(countKey, serverCount);
if (previous !== undefined && previous !== serverCount && hasCachedList) {
  invalidateEntityListForOrg(keys, organizationId, 'active');
}
```

First sight has no comparison; a reload clears the memory; cursors remain the primary cross-session mechanism. The counts ride the same `channel_counters` read as the view answers — no extra query. This is also the net that eventually catches a missed **hard** delete, which has no row to fetch.

### Unseen ledger

Badge counts are maintained by **one client-side ledger** — the unseen-counts cache, patched by an idle-batched applicator (`unseen-delta.ts`) and driven by the local seen set (`seen-store.ts`) — instead of per-event server recounts: a per-row mirror of the server's unseen predicate — recency within the shared `seenWindowMs` window (publish time on draft-lifecycle tables, else created time), not deleted, not an unpublished draft, not locally seen — applied to the rows each flush delivers (+1 new-and-unseen, −1 tombstoned-and-unseen) and to view-marks (−1). Double-count guards: `countedIds` + a `lastReconcileAt` anchor. A fork with additional feed filters must mirror them in `matchesUnseenFilters`.

The exact counts endpoint is baseline + reconcile only — staleness, window focus, catchup completion (covers cross-device seen-marks; `seen_by` is excluded from CDC) — and each recount wins wholesale, re-anchoring the ledger. A startup invariant requires every seen-tracked entity type to have **unconditional** channel read; a fork with row-conditional visibility keeps endpoint counting for that type.

### Embedded entities

Products can embed other entities (the campus fork's items embed label objects). When a source changes, embedded copies go stale; **propagation** ships only source ids so clients can patch cached hosts without querying host rows. `appConfig.entityEmbeddings` declares the relationships (`{ embeddedEntity, hostEntity, hostColumn }`); the server attaches a `propagation` hint (`update`/`remove` id lists) to notifications (no extra lookup) and to catchup answers (built by a delta-id query); the client scans cached host queries with `Set` lookups, replacing or removing embedded objects. An `updatedAt` guard never replaces a fresher embedding with an older one.

| Flow | When propagation runs | Ordering guarantee |
|------|----------------------|--------------------|
| **Live SSE** | After a non-echo source range fetch; hard deletes propagate directly | Fresh source data normally cached before update propagation |
| **Catchup** | After all delta fetches for the org | Fresh sources normally cached before hints patch hosts |

An own create/update echo returns before the propagation branch, so a same-tab source edit needs its mutation cache update to handle embedded hosts or waits for later reconciliation. The template ships `entityEmbeddings` empty.

## Writes: optimistic state and merge

### Mutation flow

```
┌───────────────────────────────────────────────────────────────────────────┐
│  User triggers mutation                                                   │
│     │                                                                     │
│     ▼                                                                     │
│  1. onMutate: apply optimistic update + squash pending same-entity        │
│     │                                                                     │
│     ▼                                                                     │
│  2. mutationFn runs under React Query networkMode: offlineFirst           │
│     │                                                                     │
│     ├── OK ──► onSuccess merges the server row into list/detail caches    │
│     │                                                                     │
│     ├── SERVER ERROR ──► module/global error handling                     │
│     │                                                                     │
│     └── OFFLINE/NETWORK ──► normally settles as error (retry: 0)          │
│                                                                           │
│  Restored mutation already marked isPaused                                │
│     └── initial catchup gate, then resumePausedMutations()                │
└───────────────────────────────────────────────────────────────────────────┘
```

Entity `query.ts` modules own optimistic updates and replay wiring so forms stay simple. Three realities worth stating plainly:

- **Online**, the stream keeps caches fresh, but merge persistence is a non-atomic read/compute/update — overlapping writes can still race (below).
- **Offline**, the current defaults do **not** reliably queue an edit: `offlineFirst` lets the first attempt run even offline, and `retry: 0` settles the network failure as an error — the module rolls back its optimistic state rather than leaving an `isPaused` mutation. The persistence/replay path applies to mutations paused for other reasons.
- **Restored** paused mutations wait for the first catchup attempt before `resumePausedMutations()` — replay starts against fresher cached data. Ordinary online mutations are not gated on stream state.

### stx and the HLC

Synced tables carry an `stx` JSONB column: the last mutation's envelope (`mutationId`, `sourceId`) plus merged per-scalar-field `fieldTimestamps`. A later mutation overwrites the envelope; the merged timestamps remain the arbitration state.

```
HLC format:  "1710500000123:0001:abcde"  (unix millis : counter : sourceId hash)
Compare:     millis, then counter, then source hash (5-char tie-break)
```

Each tab advances its own clock; the server advances its module clock from received timestamps before generating server timestamps. Clients do **not** advance their clocks from remote HLCs — this is deterministic LWW ordering, not a full causal clock.

### The wire shape

All updatable fields travel in one `ops` key; the merge strategy is implicit in the value shape:

```typescript
{
  ops: {
    name?: string;                                   // bare value → scalar → LWW with HLC
    status?: number;                                 // scalar → LWW
    labels?: { add?: string[]; remove?: string[] };  // object → array delta: remove, then add missing
  };
  stx: StxBase;
}
```

```typescript
// Client: entity modules choose the scalar field names that need an HLC.
function createStxForUpdate(scalarFieldNames: string[]): StxBase {
  return { mutationId: uuidv7(), sourceId, fieldTimestamps: createFieldTimestamps(scalarFieldNames) };
}
```

Client update schemas require exactly the scalar op keys in `fieldTimestamps` — malformed, missing, unrelated and array-delta timestamps are rejected.

### Server-side resolution

```typescript
// Client path: normalizes lens keys, filters scalar no-ops, applies HLC comparison,
// resolves array deltas against the row just read.
const resolved = resolveUpdateOps(entityType, entity, ops, stx);

// Trusted-server path: advances past stored scalar clocks, assigns one server HLC.
const serverResolved = resolveServerUpdateOps(entityType, entity, ops);
```

There is no 409 on an HLC loss: losing scalar values are simply omitted from the write, and the response entity carries the authoritative values. Resolution runs in JavaScript after reading the entity, followed by an ordinary `UPDATE` in the transaction — not a SQL compare-and-set, and the read is not `FOR UPDATE`-locked, so overlapping writes can still race (especially whole-array delta writes and `stx` metadata).

Array-delta properties: remove-then-add; idempotent on replay (re-applying a delta to its result is a no-op); **not** a commutative CRDT (no causal tags — opposite concurrent ops are order-sensitive); written back as a whole array (concurrent read-modify-write can overwrite).

### Squash, coalesce, paused persistence

- `squashPendingMutation()` removes pending same-entity updates and returns merged ops (newer scalars win, array deltas combine). The caller must place those ops into the new mutation's **variables** — using them only for optimistic cache state loses the earlier ops at request time.
- `squashIntoPendingCreate()` can fold update ops into a pending create when create variables carry a top-level `{ id }`; it assigns delta objects like values (no array resolution) and tells the update hook to return early.
- The IndexedDB persister dehydrates only mutations already `isPaused`. Persisted replay needs all routing context (`tenantId`, `organizationId`, …) inside serializable variables — closures are gone after reload. Queued variables are rewritten at boot when the persisted schema ordinal is behind the bundle ([Resilience](#resilience-domains)); replay always happens in current shape.
- Scope strategy: the default attachment create/delete hooks share `scope: { id: 'attachment' }` (serialized); updates carry no scope and run concurrently.
- Rapid typing is a module/form debounce concern — where implemented, only the final value is sent.

> **Current template limitations (attachment module):** the update hook squashes from `onMutate` where the new mutation is already pending (the helper removes every match, caller included) and uses the merged ops only for the optimistic write; create variables nest the rows in a `data` array while coalescing expects a top-level `{ id }`; delete only removes pending updates; hook variables close over `tenantId`/`organizationId` that restored replay expects in variables. Create/edit, create/delete, cross-update squash and reload replay are therefore infrastructure intentions, not working guarantees of the default module.

### Idempotency

Idempotency is operation-specific, not a global guarantee. The default attachment create checks `stx.mutationId` against activities and can return the already-created batch; update and delete perform no such check. The frontend generates `stx` inside `mutationFn`, so a re-executed mutation function can generate a fresh `mutationId`.

## Resilience domains

### Schema evolution

Deploys change schemas; clients don't update in lockstep — a PWA tab can run last week's bundle with last week's cache and queued mutations. Breaking changes ship as **append-only lens modules** (`shared/src/schema-evolution/`); the engine derives everything else. Two runtime seams:

1. **Server**: during a lens's *expand window*, generated schemas accept old and new field names; product writes pass `normalizeCreateItem`/`resolveUpdateOps`, channel writes `normalizeBody`. Normalization canonicalizes `ops` keys **and their `stx.fieldTimestamps` keys** (a renamed scalar must keep its HLC history or an older offline edit could wrongly win), and mirror-writes the expand-window twin column.
2. **Client**: the persisted meta record carries a `schemaVersion` ordinal; when behind, cached product rows, bundled channel queries and queued mutation variables are rewritten at boot — chunked Dexie transactions, pointer advanced atomically last, a Web Lock so one tab runs the pass, idempotent so an interrupted pass re-runs. No network involved.

Tabs announce their schema version on the BroadcastChannel; a tab seeing a higher version (or a newer pointer on disk) marks itself **stale** and stops persisting — an old bundle must never write old-shape data over a migrated store. Telemetry: the client attaches `X-Client-Version` and the backend records its distribution through OTel; `lens:check` enforces append-only modules, purity and contracts, but contraction timing is policy constants, not an automated gate yet. With an empty lens list (the current state) every seam is a passthrough; the escape hatch remains `appConfig.clientCacheVersion` (bump → cache wipe keeping queued mutations), enforced by the `schema-bust-gate` CI job. Details: [Schema evolution](/docs/page/architecture/schema-evolution).

### Multi-tab coordination

```
┌──────────────────────────────────────────────────────────────────────┐
│  Tab 1 (Leader)                Tab 2 (Follower)   Tab 3 (Follower)   │
│  ┌─────────────────┐           ┌─────────────┐    ┌─────────────┐    │
│  │ SSE Connection  │           │  No SSE     │    │  No SSE     │    │
│  └────────┬────────┘           └──────▲──────┘    └──────▲──────┘    │
│           ▼                           │                  │           │
│  ┌─────────────────┐                  │                  │           │
│  │ BroadcastChannel│──────────────────┴──────────────────┘           │
│  └─────────────────┘                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

The first tab to acquire the Web Lock becomes leader and owns the single SSE connection, broadcasting notifications to followers; when it closes, a waiting follower is promoted. All tabs for a user share `${appConfig.slug}:${userId}`. With `offlineAccess` they share the `rq` persistence scope (session mode uses per-tab `s-<tab>`); product queries persist as individual records while channel queries and the dehydrated mutation array share one `meta` record per scope. All tabs can mutate; only the leader's paused mutations pass `shouldDehydrateMutation`.

> **Known limitation:** leader-only dehydration reduces duplicate queues but the shared persister is not a single-writer system — a follower's query write can replace the meta record with its own (usually empty) mutation array, losing a follower's paused mutation on refresh. Schema-version guards protect shape compatibility, not mutation ownership.

### Server detail cache

One authenticated TTL cache for product detail endpoints, keyed `{entityType}:{entityId}` from the request path (no tokens). It caches **enriched endpoint responses** (signed URLs, relations) — not raw rows — because that is what the next request needs.

```
1. GET /items/i42 → appCache middleware keys `item:i42`
2. HIT: re-run checkPermission against the cached row (memberships already on ctx —
   guards run outer to the cache, so the recheck is CPU-only) → serve, or fall
   through to the handler for the authoritative 403/404
3. MISS: coalesce concurrent misses by entity key (singleflight) → handler runs once
4. CDC change (single subjectId or batch row ids, physical deletes via the
   ActivityBus hook) → invalidateByEntity(type, id) → next fetch re-enriches
```

Hits also apply the draft veto (`draftVisibleTo`): an author-cached unpublished draft never serves to anyone else. Forks adopt per route: `xCache: [appCache('<entityType>')]`.

| Race | Mitigation |
|------|------------|
| Thundering herd (detail) | Singleflight by entity key |
| Thundering herd (list fan-out) | Negotiated lazy scheduling |
| Rapid sequential updates | Delete-on-invalidate; next fetch re-enriches |
| Revoked access after caching | Per-request `checkPermission` on every hit |
| Read-your-writes | Cache miss falls through to DB |

Defaults: 5000 entries (~25–50MB RAM), 10 min TTL.

### Collaborative text editing (Yjs)

Optional and off in the template (`appConfig.services.yjs.enabled: false`, no registered materializer). A standalone relay ([yjs/README](../yjs/README.md)) is the single writer for registered rich-text fields during collaboration: it seeds sessions from the entity row, merges edits via CRDT, and materializes back through the entity's standard update path (per-entity registry: `registerYjsMaterializer`) using `resolveServerUpdateOps()` (one server HLC, causally after the affected fields' clocks) — so CDC, SSE and this engine see collab edits as ordinary trusted-server updates. The client keeps exactly two sync responsibilities: register Yjs-owned fields (`registerYjsOwnedFields`) so SSE skips them while an editor is open (a stale snapshot must not overwrite the live doc; other fields flow normally), and fall back to solo REST editing when the relay is unreachable. On editor close, a cache-only optimistic summary renders instantly; the relay's authoritative materialization arrives via SSE moments later.

## Guarantees and non-guarantees

What the engine promises:

- **Per-view eventual delivery.** A view's cursor is always ≤ the frontier, and the difference is always closable by one delta fetch on the ordinary list endpoint. Advance-after-ingest makes delivery effectively at-least-once with idempotent upserts — a crash between fetch and advance re-fetches, never skips.
- **One order per org.** All product types share the org sequence; WAL commit order is sequence order; batch `count` is authoritative even where ranges interleave.
- **Deletes are learnable.** Soft deletes are seq-stamped tombstones returned by delta fetches. Because a reconnecting client can only learn a soft delete from that row, any future hard-purge policy must respect the maximum supported offline window.
- **Frontiers only move forward, and every advance is fetchable** — drafts never enter the stream, so no view can be signaled toward rows it cannot fetch.
- **Authorization is uniform.** The same permission engine evaluates list reads, delta fetches, SSE dispatch and detail-cache hits, against full rows; summaries additionally require proof (`ok`/`opaque`/`forbidden`, anti-oracle).
- **Lost visibility is announced.** A reparent a subscriber cannot follow produces `moveOut`; an unpublish reaches old readers as a delete.

What it deliberately does not promise:

- **No cross-client causality.** HLC merge is deterministic LWW; clients don't advance clocks from remote timestamps. Array deltas are idempotent but not commutative.
- **No authz/content snapshot consistency.** Memberships and cursors advance independently (no zookies); cella approximates with per-request snapshots and live refresh before dispatch.
- **No guaranteed offline queue by default.** `offlineFirst` + `retry: 0` settles an offline mutation as an error; only already-paused mutations persist, and follower tabs' paused mutations can be lost ([Multi-tab](#multi-tab-coordination)).
- **No write serialization.** Merge resolution is read/compute/update without row locks; whole-array writes and `stx` metadata can race under concurrency.
- **Hard deletes reconcile lazily** — no row to fetch, so invalidation plus the count-drift check carry the recovery.
- **Idempotency is per-operation**, not a global mutation guarantee.
- **A combined publish+reparent emits no move-out** (it arrives as an INSERT without an old row); affected readers never saw the draft.
- **New-org SSE coverage needs a reconnect** — the stream registers the orgs visible at open.
- **Lens contraction is policy, not enforcement** — no automated gate consumes the version telemetry yet.

## Reference

### SSE transport

Product-entity and membership notifications share `event: change`, `id: activityId`, `data: JSON(StreamNotification)`. On connect the server sends `event: offset` with its current cursor — the client's live barrier. Keep-alives are SSE comments (`: ping`); application failures use `event: error`.

### Notification payload

```typescript
interface StreamNotification {
  kind: 'entity' | 'membership';
  action: 'create' | 'update' | 'delete' | 'moveOut';
  entityType: string | null;      // Product entity type (null for membership events)
  resourceType: string | null;    // 'membership' for membership notifications
  subjectId: string | null;
  organizationId: string | null;
  tenantId: string | null;
  channelType: string | null;     // Channel entity type for membership (e.g. 'project')
  path: string | null;            // Materialized id-path of the rows (moveOut: the OLD path)
  channelId: string | null;       // Home channel id for unseen count grouping
  seq: number | null;             // Org-sequence position stamped by the CDC worker
  stx: StxBase | null;            // Sync transaction metadata (entities only)
  batchUntilSeq: number | null;   // Last position in batch (null = single notification)
  count: number | null;           // Authoritative batch row count (ranges may interleave)
  syncWindow: number | null;      // Server-suggested lazy-fetch spread window in ms
  propagation: PropagationHint | null;
}

interface PropagationHint {
  sourceType: string;             // e.g. 'label'
  targetType: string;             // host that embeds it, e.g. 'item'
  field: string;                  // host column, e.g. 'labels'
  update: string[];               // source ids created/updated
  remove: string[];               // source ids deleted
}

interface StxBase {
  mutationId: string;             // UUIDv7 per mutation attempt
  sourceId: string;               // Browser instance UUIDv7; 'server' for server writes
  fieldTimestamps: Record<string, string>; // Per-scalar-field HLC timestamps
}
```

### Catchup wire

Request: `{ cursor, views }` where each view is `{ key, organizationId, prefixes, entityTypes, depth?, cursor }` (`depth: 'self' | 'subtree'`, defaulting to `'subtree'` when omitted — the auto-generated org views omit it). Response: `{ views, changes, cursor }`:

```typescript
interface CatchupViewAnswer {
  key: string;                          // echoed client view key
  status: 'ok' | 'opaque' | 'forbidden';
  frontiers?: Record<string, number>;   // per-type max f:/fs: over the prefixes (ok only)
  counts?: Record<string, number>;      // per-type e:/es: sums (ok only)
}
interface CatchupChangeSummary {        // per-org block: what is NOT per-view
  signals?: { membership?: number };    // bump-only change signals (no sequence claim)
  propagation?: PropagationHint[];      // embedding hints from frontier vs view cursors
}
```

### seqCursor forms

`seqCursor=51` → `seq >= 51`, open-ended (catchup). `seqCursor=51,150` → inclusive bounded range (live batches).

### Counter keys

On `channel_counters.counts` (JSONB). Prefixed = per-entity-type family; bare = org-row singleton. Max-merge: `f:`, `fs:`, `li:`, `lu:`; the rest sum, floored at zero.

| Key | Node | Meaning |
|-----|------|---------|
| `sequence` | org | Org-sequence reservation counter |
| `membership` | org | Bump-only membership change signal |
| `f:{type}` / `fs:{type}` | org + ancestors / home | Subtree / self frontier |
| `e:{type}` / `es:{type}` | org + ancestors / home | Subtree / self countable-row count |
| `li:{type}` / `lu:{type}` | home | Last-insert / last-update epoch ms |
| `m:{role}`, `m:total`, `m:pending` | membership channel | Membership counts |

### Glossary

- **Activity / message / event / notification** — the one change at its four layers: DB audit record, worker→API WebSocket payload, in-process ActivityBus emission, SSE payload.
- **Product entity** — synced entity: sequence-stamped, streamed, offline-capable. **Channel entity** — membership-scoped host that carries the permission check.
- **Channel** — a row's home: deepest non-null channel ancestor, org fallback. Audience grouping, unseen counts and activity stamps key on it; sequence allocation does not.
- **Sequence** — the one monotonic org counter all product types share. **seq** — a row's stamped sequence position.
- **Frontier** — newest sequence position at/below a node (`f:`) or homed at it (`fs:`); the boundary up to which change has been incorporated (the term follows dataflow systems à la Timely/Materialize).
- **Cursor** — a client view's ingested position; behind the frontier ⇒ delta fetch.
- **Path** — materialized root-first id-path; any subtree is a prefix.
- **View** — `{prefixes, entityTypes, depth, cursor}`, the client sync unit. **Self** (`depth: 'self'`): rows homed at the node. **Subtree**: rows at or below it.
- **Channel view** — the live wire's implicit single-prefix view per `{entityType}:{channelId ?? organizationId}`, managed from notifications by the lazy scheduler.
- **Delta fetch** — an ordinary list read bounded by `seqCursor`, closing a cursor→frontier difference.
- **Tombstone** — a soft-deleted row (`deletedAt` set) that stays fetchable so absent clients can learn the delete.
- **stx** — the sync transaction envelope (mutation id, source id, per-field HLC timestamps), stored on the row and carried on notifications.
- **"Scope"** is retired from sync vocabulary (survives only in persister storage partitions and the permission engine's "readable scope"); **"context"** means only the ambient kind (`AuthContext`, request `Context`) — anything that routes a change is a channel (see [the rename](./migrations/2026-07-channel-entity-rename/README.md)).

### References

- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - multi-tab coordination patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - browser leader election

**Influences:**
- [ElectricSQL](https://electric-sql.com/) - shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with event sourcing
- [Sequin](https://sequinstream.com/) - Postgres CDC with strict ordering, backfills, exactly-once delivery
- [TinyBase](https://tinybase.org/) - reactive data store with CRDT support, HLC design influence
- [y-protocols](https://github.com/yjs/y-protocols) - Yjs sync/awareness protocol primitives
- [Teleportal](https://teleportal.tools/) - local-first sync engine with CRDTs and end-to-end encryption
