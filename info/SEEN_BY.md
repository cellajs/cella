# Seen-by tracking & notification counts

This document defines the requirements and design options for two related features that use a shared `seenBy` table:

1. **Unseen counts in menu** — per user, per context entity, a badge showing how many product entities they haven't viewed
2. **View counts per entity** — per product entity, a column showing how many members have viewed it

Both features apply only to org-scoped (non-public) product entities (e.g., attachments). Parentless public entities like pages are excluded. Both features work with the sync engine and respect pg_partman's 90-day retention on the `seenBy` table.

## Goals

- **Scalable writes** — seen records are batched client-side and posted on intervals (every 10 minutes), not on every view
- **Performant reads** — view counts are precomputed; unseen counts are derived from `seenBy` with indexed queries
- **Sync-aware** — integrates with CDC, SSE notifications, and catchup to keep counts fresh in real time
- **Bounded storage** — `seenBy` is partitioned with 90-day retention; only entities within the 90-day window participate in unseen/view counts

## Feature specifications

### 1. Unseen counts (menu badge)

The menu sheet shows a count badge per context entity (e.g., organization) indicating how many product entities the user hasn't seen. The badge appears on each `MenuSheetItem` and/or `MenuSectionButton`.

**Rules:**
- A product entity is "unseen" if the user has no `seenBy` record for it AND it was created within the last 90 days
- Entities older than 90 days are excluded from unseen counts entirely (assumed "seen")
- Archived menu items (membership.archived) do also show unseen counts but in a less explicit way and not propagated to the menu section
- Muted menu items (membership.muted) suppress the unseen badge but still track seenBy records; UI handles this
- The count aggregates all product entity types within that context (e.g., attachments + any future types in an org), with per-type breakdown available on hover
- A product entity is considered "seen" when it intersects the viewport in a list/table view (IntersectionObserver). No need to explicitly open or preview it

**Data needed at render time:** `{ contextKey: string, unseenCount: number }` per org the user belongs to.

### 2. View count (entity column)

Members of a context entity can see how many unique members have viewed each product entity. This is shown as a column in list views (e.g., attachment table).

**Rules:**
- View count = number of distinct users who have a `seenBy` record for that entity
- The count is denormalized into a fast-read location (see options below) so listing endpoints don't JOIN against `seenBy`
- After 90 days, seenBy records are dropped by partman — the denormalized view count persists but can no longer be reconstructed from raw data
- View count is approximate after retention expiry (it captures the historical high-water mark, not current state)

**Data needed at render time:** `viewCount: number` per entity in list responses.

## Database design

### seenBy table

```
seenBy (partitioned by created_at via pg_partman, 90-day retention)
├── id              varchar PK (composite with createdAt for partitioning)
├── userId          varchar NOT NULL → users.id
├── entityId        varchar NOT NULL
├── entityType      varchar NOT NULL (enum: productEntityTypes)
├── organizationId  varchar NOT NULL → organizations.id
├── tenantId        varchar NOT NULL → tenants.id
├── createdAt       timestamp NOT NULL DEFAULT now() (partition key)
└── UNIQUE (userId, entityId) within partition window
```

**Design notes:**
- **Not tracked by CDC** — like `userActivityTable`, frequent writes should not generate activities/SSE noise. The table is excluded from `entityTables` and `resourceTables` in `table-config.ts`.
- **Composite PK** `(id, createdAt)` — required for pg_partman range partitioning, same pattern as `activitiesTable`.
- **Deduplication** — `ON CONFLICT (userId, entityId) DO NOTHING` on insert. Within the 90-day window, duplicate pairs are silently ignored. After old partitions are dropped, a user can "re-see" an entity (this is acceptable since the view count counter was already incremented).
- **No RLS required** — this table is written by the backend (not tenant-scoped RLS context) and read only for aggregation. Access control happens at the API layer.

### Partman configuration

Same pattern as existing partitioned tables:

| Setting | Value |
|---------|-------|
| Partition key | `created_at` |
| Interval | 1 week |
| Retention | 90 days |
| `retention_keep_table` | false |
| `infinite_time_partitions` | true |

## Design options: view count storage

Where to store the denormalized view count for each product entity.

### Option A: column on product entity tables

Add `viewCount integer NOT NULL DEFAULT 0` to `productEntityColumns()`.

| Pros | Cons |
|------|------|
| Zero-cost reads — already in SELECT | Triggers CDC on every increment → noisy activities, SSE fan-out |
| No JOINs needed | Conflicts with `stx` versioning (version bump on view count change?) |
| Simple schema | Write amplification: every batch of seenBy records triggers N entity UPDATEs |
| | Couples view analytics to entity lifecycle |

**Mitigation for CDC noise:** Could configure the CDC worker to ignore `viewCount` in `changedKeys` and skip activity creation when it's the only changed field. But this adds conditional logic to the CDC pipeline.

### Option B: separate seen counts table

```
seen_counts
├── entityId          varchar
├── entityType        varchar NOT NULL
├── viewCount         integer NOT NULL DEFAULT 0
├── entityCreatedAt   timestamp NOT NULL  (partition key)
├── updatedAt         timestamp NOT NULL DEFAULT now()
└── PK(entityId, entityCreatedAt)
```

| Pros | Cons |
|------|------|
| No CDC trigger — table not tracked | Requires LEFT JOIN when listing entities with view counts |
| Clean separation of concerns | Additional table to maintain |
| Can update atomically with `ON CONFLICT DO UPDATE SET viewCount = viewCount + $delta` | Two-phase: insert seenBy + update counter |
| Independent lifecycle from entity data | |

### Option C: JSONB in contextCounters

Extend `contextCountersTable.counts` with per-entity keys like `v:{entityId}`.

| Pros | Cons |
|------|------|
| No new table | JSONB bloats with thousands of entity keys per org |
| Existing atomic upsert pattern | O(n) scan to extract counts for a list of entities |
| | Doesn't scale beyond ~100 entities per org |
| | Breaks the "extensible metadata" intent of the counts field |

**Not recommended** — contextCounters is designed for aggregate counts (entity totals, role breakdowns), not per-entity metrics.

### Option D: materialized view

```sql
CREATE MATERIALIZED VIEW seen_counts_mv AS
SELECT entity_id, entity_type, COUNT(DISTINCT user_id) AS view_count
FROM seen_by
GROUP BY entity_id, entity_type;
```

| Pros | Cons |
|------|------|
| Always accurate within refresh window | Stale between refreshes (minutes/hours) |
| No write-path changes | Full refresh is expensive at scale |
| Simple query | Lost when seenBy partitions are dropped (90 days) |
| | Concurrent refresh required to avoid blocking reads |
| | No persistence beyond retention window |

**Not recommended** as primary storage — could supplement as a consistency check.

### Option E: Redis / in-memory cache

Use Redis `HINCRBY` for atomic counter increments, read from cache on list endpoints.

| Pros | Cons |
|------|------|
| Sub-millisecond reads | Additional infrastructure dependency |
| No DB write amplification | Data loss on Redis restart (unless persisted) |
| Natural TTL support | Cache warming on cold start |
| | Divergence risk between cache and seenBy source |

Could be added as an acceleration layer on top of Option B.

### Recommendation: Option B (separate table)

**`seenCounts` table** is the best fit because:
- It follows the existing pattern of separating hot-write data from CDC-tracked tables (like `userActivityTable`)
- Atomic `UPSERT` with `viewCount = viewCount + $delta` is simple and race-free
- LEFT JOIN cost is negligible with a composite PK on `(entityId, entityCreatedAt)`
- Partitioned via pg_partman with the same 90-day retention as seenBy, so both tables drop data on the same schedule
- If Redis is added later, it can accelerate reads without changing the schema
- No stale data — viewCounts are automatically dropped when the entity ages out of the 90-day window

## Unseen count derivation

With only 2 tables (`seenBy` + `seenCounts`), unseen counts are derived directly from `seenBy` at query time rather than stored in a separate counter table.

### Query

```sql
SELECT COUNT(*) FROM attachments a
WHERE a.organization_id = $orgId
AND a.created_at > now() - interval '90 days'
AND NOT EXISTS (
  SELECT 1 FROM seen_by s
  WHERE s.entity_id = a.id AND s.user_id = $userId
)
```

The 90-day filter on `created_at` is critical:
- It scopes the query to only entities within the seenBy retention window, ensuring dedup rows always exist for relevant entities
- It prevents the query from scanning the full entity table
- It naturally handles new members — they only see unseen counts for recent entities, not the entire backlog
- Combined with a composite index on `seenBy (userId, organizationId, entityType)`, performance is adequate for orgs with typical entity volumes

### Why not a separate counter table?

A dedicated `userSeenCounts` table (Option D in earlier analysis) provides O(1) reads but introduces drift after partition drops, a second write path, and a third table. Since the 90-day entity age filter bounds the query to a manageable set, and the `seenBy` table has proper indexes, the direct query approach is simpler with acceptable performance.

## Client implementation

### Tracking seen entities

```
Client-side seen tracking (in-memory per tab, no persistence needed)
├── Map<contextKey, Set<entityId>> — entities viewed this session
├── Updated when entity row intersects the viewport in a list/table (IntersectionObserver)
├── Flushed every 10 minutes via interval
└── Flushed on page unload (navigator.sendBeacon as fallback)
```

### Batch POST format

```typescript
// POST /orgs/:orgId/seen
interface SeenBatchRequest {
  /** Array of entity IDs the user has viewed since last batch */
  entityIds: string[];
  /** Entity type for all IDs in this batch */
  entityType: ProductEntityType;
}
```

**Why not ranges?** Entity IDs in Cella use `nanoid` (non-sequential, non-sortable). Ranges of random IDs don't compress. If sequential IDs were used (ULID, snowflake), ranges like `[startId, endId]` could compress contiguous blocks. With nanoid, sending the ID array directly is both simpler and equivalent in payload size. For very large batches (>500 IDs), chunking into multiple requests is preferable to range encoding.

**Alternative range format** (if entity IDs become sortable in the future, or for seq-based approach):

```typescript
interface SeenRangeRequest {
  /** Ranges of seq numbers the user has seen */
  ranges: Array<{ from: number; to: number }>;
  entityType: ProductEntityType;
}
```

This would allow transmitting "I've seen everything from seq 10 to seq 45, and seq 50 to seq 52" as `[{from:10,to:45},{from:50,to:52}]` instead of listing 38 individual IDs. Only viable if the client has seq-numbered entities.

### Interval flush logic

```
Every 10 minutes:
├── For each contextKey with pending seen IDs:
│   ├── POST /orgs/:orgId/seen { entityIds, entityType }
│   ├── On 200: clear local Set for that contextKey
│   └── On error: retain Set, retry next interval
├── Skip if Set is empty (no new views)
└── On page unload: flush immediately via sendBeacon
```

### Menu badge rendering

The `MenuSheetItem` component receives an `unseenCount` prop derived from a query or store:

```
Query: GET /me/unseen-counts
Response: { counts: [{ contextKey, entityType, unseenCount }] }
```

This endpoint derives unseen counts from `seenBy` with a 90-day entity age filter. Called on initial menu load and invalidated when SSE notifications arrive for product entity creates.

## Backend implementation

### POST /orgs/:orgId/seen handler

```
1. Validate: user is member of org, entityIds are valid, entityType is product type
2. Filter: only accept entityIds for entities created within 90 days
3. Deduplicate entityIds against seenBy (INSERT ... ON CONFLICT DO NOTHING, RETURNING entityId)
4. Count actually-inserted rows (new views only)
5. If newCount > 0:
   a. UPDATE seenCounts SET viewCount = viewCount + 1 WHERE entityId IN (newIds)
      (one UPSERT per entity, or batched)
6. Return 200 with { newCount }
```

### GET /me/unseen-counts handler

```
1. Get user's memberships (already in ctx.var.memberships)
2. Get orgIds from memberships (non-muted)
3. For each orgId + productEntityType, query:
   COUNT(*) FROM {entityTable}
   WHERE organization_id = $orgId
   AND created_at > now() - interval '90 days'
   AND NOT EXISTS (SELECT 1 FROM seen_by WHERE entity_id = {entityTable}.id AND user_id = $userId)
4. Return array of { contextKey, entityType, unseenCount }
```

### Attachment list with view counts

Extend the existing `getAttachments` handler with an optional LEFT JOIN:

```sql
SELECT a.*, COALESCE(vc.view_count, 0) AS view_count
FROM attachments a
LEFT JOIN seen_counts vc ON vc.entity_id = a.id
WHERE a.organization_id = $orgId
ORDER BY ...
LIMIT ... OFFSET ...
```

The `viewCount` field is added to the attachment response schema.

## Integration with sync engine

### CDC worker (no changes needed for core flow)

The CDC worker already:
- Tracks `contextCounters.counts['e:{entityType}']` on product entity create/delete
- These totals are the denominator for unseen count calculation

The CDC worker does **not** process `seenBy` inserts — the table is intentionally excluded from CDC tracking.

### SSE notifications

When a new product entity is created, the existing SSE notification flow already works:
1. CDC detects INSERT on product entity table
2. Activity persisted, seq incremented, SSE notification sent
3. Client receives notification, invalidates entity list query
4. **New:** Client also invalidates its `unseenCounts` query (or increments the local count optimistically)

No new SSE event type is needed. The client derives "unseen count changed" from existing `{entityType}.created` events.

### Catchup

The existing catchup mechanism provides `seq` deltas per org. The client can use this to determine if unseen counts need refreshing:
- If `delta > 0` for an org → refetch unseen counts for that org
- If `delta === deletedIds.length` → only deletes, unseen count may have decreased → refetch

## Migration

### New tables

1. `seenBy` — partitioned via pg_partman by `createdAt` (weekly, 90-day retention)
2. `seenCounts` — partitioned via pg_partman by `entityCreatedAt` (weekly, 90-day retention)

### Partman setup

Same migration pattern as existing partman tables — create template table, partition, configure retention. Both tables are set up in a single migration. See `20260223223705_partman_setup` for reference.

### Backfill

No backfill needed — all counts start at 0. Existing entities have no view history, which is correct (nobody has "seen" them through this system yet). The `unseenCount` for existing members will equal the number of entities created within the last 90 days in their orgs, which naturally decreases as they view entities.

## Edge cases

| Scenario | Handling |
|----------|----------|
| New member joins org | No seenBy rows → unseenCount = count of entities created in last 90 days. Manageable, not the full backlog. |
| Member leaves org | seenBy rows remain (harmless) — no unseen badge shown since membership is gone |
| Entity deleted | Entity no longer in query results → unseenCount auto-decreases. `seenCounts` row is cleaned up when its partition is dropped. |
| seenBy partition dropped (90 days) | Both `seenBy` and `seenCounts` partitions drop on the same 90-day schedule (seenBy by `createdAt`, seenCounts by `entityCreatedAt`). No orphaned data, no stale counters. |
| Very large org (10k members) | Entity create triggers no member-level writes. Only `contextCounters` is updated (one row). Unseen count queries are bounded by the 90-day filter. |
| Offline / multi-tab | Seen tracking happens per tab with a shared flush interval. Leader tab (via existing Web Locks) owns the flush. BroadcastChannel syncs newly-seen IDs across tabs before flush. |
| viewCount accuracy after 90 days | Not applicable — seenCounts partitions are dropped on the same 90-day schedule, so stale counters never exist. |

## Performance characteristics

| Operation | Cost | Frequency |
|-----------|------|-----------|
| seenBy INSERT batch | O(batch_size) with ON CONFLICT | Every 10 min per active user |
| seenCounts UPSERT | O(new_views) per batch | Every 10 min per active user |
| Unseen count read (menu) | O(orgs × entityTypes) — NOT EXISTS query with 90-day filter per org | On menu open + SSE entity.created |
| View count read (list) | O(1) per entity via LEFT JOIN | On entity list fetch |
| CDC entity create | O(1) — existing contextCounters update only | On each entity create |

## Summary of new tables

| Table | Purpose | Partitioned | CDC tracked | Retention |
|-------|---------|-------------|-------------|-----------|
| `seenBy` | Raw per-user-per-entity view records | Yes (pg_partman, weekly, 90 days) | No | 90 days |
| `seenCounts` | Denormalized unique viewer count per entity | Yes (pg_partman, weekly, 90 days) | No | 90 days |


## Decisions

1. **Granularity of "seen"** — intersecting the viewport in a list/table (IntersectionObserver) is sufficient. No need to explicitly open or preview.
2. **Muted orgs** — suppress the unseen badge, still track seenBy records.
3. **Per-entity-type breakdown** — aggregate count in badge, per-type breakdown available on hover.
4. **Re-see after partition drop** — prevented by the 90-day entity age filter. Entities older than 90 days are excluded from seen tracking, so the seenBy dedup row always exists for relevant entities.
5. **sendBeacon payload limit** — `navigator.sendBeacon` has a ~64KB limit. With nanoid (21 chars), this allows ~3000 entity IDs per beacon. Sufficient for the 10-minute window in practice.

## Open questions

1. **IntersectionObserver threshold** — what minimum visible duration / viewport intersection ratio should trigger "seen"? Needs UX testing.
2. **Unseen count cap** — should the badge cap at a number (e.g., "99+") for large counts?
3. **Entity age window** — 90 days aligns with seenBy retention. Should this be configurable per deployment?
