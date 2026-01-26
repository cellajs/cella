# CDC Membership Entity Data Design

This document describes how to include entity data in CDC membership events so the API doesn't need to fetch entity details when processing membership changes.

## Problem Statement

When a membership is created, updated, or deleted, the CDC Worker captures the change and broadcasts it via WebSocket. Currently, the membership row data is sent, but clients often need associated entity data (organization name, user info, etc.) to properly render the membership in UI.

**Current flow:**
1. Membership INSERT/UPDATE/DELETE → CDC captures row
2. CDC sends membership data to API via WebSocket
3. API broadcasts to relevant clients
4. Clients may need additional entity data → extra API calls

**Desired flow:**
1. Membership INSERT/UPDATE/DELETE → CDC captures row
2. CDC enriches with entity data
3. API receives complete data, broadcasts directly
4. Clients have all needed data immediately

## Design Options

### Option 1: Denormalized Entity Columns in Membership (Recommended)

Add entity snapshot columns directly to the memberships table that get populated on insert/update.

```sql
-- Migration: add entity snapshot columns
ALTER TABLE memberships ADD COLUMN entity_snapshot JSONB;
```

**Handler updates:**
```typescript
// In insertMemberships helper
const membershipsToInsert = memberships.map((m) => ({
  ...m,
  entitySnapshot: {
    name: entity.name,
    slug: entity.slug,
    thumbnailUrl: entity.thumbnailUrl,
  },
}));
```

**Pros:**
- CDC Worker sends complete data with no additional queries
- Entity data available in single WAL event
- Consistent with event sourcing patterns

**Cons:**
- Data denormalization
- Snapshot can become stale if entity is updated (acceptable for membership events)
- Larger row size

### Option 2: JOIN Query in CDC Worker (Implemented)

CDC Worker performs database query to fetch related entity data with LRU caching.

```typescript
// In handleInsert for membership
export async function handleInsert(
  entry: TableRegistryEntry,
  message: Pgoutput.MessageInsert
): Promise<ProcessMessageResult> {
  const row = convertRowKeys(extractRowData(message.new));
  
  // Enrich membership data with user and entity info
  let enrichedData = row;
  if (entry.kind === 'resource' && entry.type === 'membership') {
    const enrichment = await enrichMembershipData(row);
    enrichedData = { ...row, ...enrichment };
  }
  
  return { activity, entityData: enrichedData, entry };
}
```

**Implementation details:**
- Enrichment module: `cdc/src/enrichment/`
- LRU cache: 500 entries, 30s TTL for both users and entities
- Parallel queries: User and entity fetched concurrently

**Pros:**
- Always fresh entity data
- No schema changes required
- Minimal latency impact with caching

**Cons:**
- Adds database query per membership event (mitigated by cache)
- CDC Worker needs database access (already available)

### Option 3: Entity Columns on Membership Table

Add flat columns for commonly needed entity fields.

```typescript
// memberships table schema
export const membershipsTable = pgTable('memberships', {
  // ... existing columns
  
  // Denormalized entity fields (populated on insert)
  entityName: varchar(),
  entitySlug: varchar(),
  entityThumbnailUrl: varchar(),
});
```

**Pros:**
- Simple to query
- No JSON parsing needed

**Cons:**
- Multiple new columns
- More migration complexity

## Recommended Implementation: Hybrid Approach

Combine Option 1 (entity snapshot) with lazy enrichment in CDC Worker.

### Step 1: Add entitySnapshot column to memberships

```typescript
// backend/src/db/schema/memberships.ts
import { jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';

export const membershipsTable = pgTable('memberships', {
  // ... existing columns
  
  // Entity snapshot for CDC enrichment
  entitySnapshot: jsonb().$type<MembershipEntitySnapshot>(),
});

export interface MembershipEntitySnapshot {
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  entityType: string;
}
```

### Step 2: Populate snapshot on membership creation

```typescript
// backend/src/modules/memberships/helpers/insert.ts
export async function insertMemberships(memberships: MembershipInsert[]) {
  const membershipsWithSnapshot = memberships.map((m) => ({
    ...m,
    entitySnapshot: {
      name: m.entity.name,
      slug: m.entity.slug,
      thumbnailUrl: m.entity.thumbnailUrl ?? null,
      entityType: m.entity.entityType,
    },
  }));
  
  return db.insert(membershipsTable).values(membershipsWithSnapshot).returning();
}
```

### Step 3: CDC Worker uses snapshot directly

```typescript
// cdc/src/handlers/insert.ts
export function handleInsert(entry: TableRegistryEntry, message: Pgoutput.MessageInsert): ProcessMessageResult {
  const row = convertRowKeys(extractRowData(message.new));
  
  // For memberships, entitySnapshot is already in the row
  // No additional query needed
  
  return {
    activity: buildActivity(entry, row),
    entityData: row, // Includes entitySnapshot
  };
}
```

### Step 4: Frontend receives complete data

```typescript
// Frontend ActivityBus handler
onMembershipCreated: (data) => {
  const { entitySnapshot, userId, role } = data;
  
  // Display directly without additional fetch
  showNotification(`${user.name} joined ${entitySnapshot.name} as ${role}`);
}
```

## User Entity Data for Memberships

For user information in membership events, the same pattern applies:

```typescript
export interface MembershipEntitySnapshot {
  // Entity info
  entityName: string;
  entitySlug: string;
  entityThumbnailUrl: string | null;
  entityType: string;
  
  // User info (populated on insert)
  userName: string | null;
  userEmail: string;
  userThumbnailUrl: string | null;
}
```

## Migration Path

1. Add `entitySnapshot` column to memberships table (nullable initially)
2. Backfill existing memberships with entity data
3. Update `insertMemberships` helper to populate snapshot
4. CDC Worker already sends full row data - no changes needed
5. Frontend updates to use snapshot data

## Considerations

### Snapshot Staleness
Entity snapshots become stale if the entity name/slug changes. This is acceptable because:
- Membership events are about the membership, not the entity
- Entity changes trigger separate entity update events
- For critical display, clients can still fetch fresh entity data

### Privacy
User data in snapshot should respect privacy settings. Only include:
- Public profile fields (name, thumbnail)
- Email only if visible to recipient

### Storage
JSONB snapshot adds ~200-500 bytes per membership. For applications with many memberships, consider:
- Limiting snapshot fields
- Compressing rarely-accessed fields
- Using separate snapshot table with retention policy
