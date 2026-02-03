# Soft Delete Implementation Plan

This document describes the implementation of soft delete for realtime/offline entities to enable reliable delta sync.

## Overview

Implement soft delete pattern for `RealtimeEntityType` entities (currently `attachment`, `page`) to allow:
- Delta sync via `modifiedAfter` queries that include deleted items
- Reliable offline-to-online reconciliation
- 30-day retention via pg_partman before hard delete

## Why Soft Delete?

| Problem with Hard Delete | Soft Delete Solution |
|--------------------------|---------------------|
| Deleted rows are gone - can't query them | `deletedAt` timestamp preserves row |
| Delta sync misses deletes | `modifiedAfter` returns deleted items too |
| Activities table needed for delete tracking | Entity table self-sufficient |
| Complex join logic for sync | Simple timestamp filter |

## Scope

**In scope** (RealtimeEntityType - tx-enabled entities):
- `attachments` table
- `pages` table
- Future realtime entities

**Out of scope** (standard CRUD entities):
- `users` table
- `organizations` table  
- `memberships` table
- Context entities

---

## Phase 1: Database Schema Changes

### 1.1 Add Soft Delete Columns

Create migration to add `deletedAt` column to realtime entity tables:

```sql
-- drizzle/XXXX_soft_delete.sql

-- Add deletedAt to attachments
ALTER TABLE attachments ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX attachments_deleted_at_index ON attachments (deleted_at) WHERE deleted_at IS NOT NULL;

-- Add deletedAt to pages  
ALTER TABLE pages ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX pages_deleted_at_index ON pages (deleted_at) WHERE deleted_at IS NOT NULL;

-- Composite index for delta sync queries (modifiedAfter pattern)
CREATE INDEX attachments_modified_at_index ON attachments (modified_at DESC);
CREATE INDEX pages_modified_at_index ON pages (modified_at DESC);
```

### 1.2 Update Drizzle Schema

```typescript
// backend/src/db/utils/product-entity-columns.ts

import { timestamp } from 'drizzle-orm/pg-core';

export const productEntityColumns = <T extends string>(entityType: T) => ({
  ...baseEntityColumns(entityType),
  // Soft delete: null = active, timestamp = deleted
  deletedAt: timestamp({ mode: 'string' }),
});
```

### 1.3 pg_partman for Soft Delete Cleanup

Create migration to set up automatic hard delete after 30 days:

```sql
-- drizzle/XXXX_soft_delete_cleanup.sql

-- Create cleanup function for soft-deleted records
CREATE OR REPLACE FUNCTION cleanup_soft_deleted_entities()
RETURNS void AS $$
BEGIN
  -- Hard delete attachments soft-deleted more than 30 days ago
  DELETE FROM attachments 
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days';
    
  -- Hard delete pages soft-deleted more than 30 days ago
  DELETE FROM pages 
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days';
    
  -- Log cleanup
  RAISE NOTICE 'Soft delete cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule via pg_cron (if available) or external scheduler
-- SELECT cron.schedule('soft-delete-cleanup', '0 3 * * *', 'SELECT cleanup_soft_deleted_entities()');
```

Alternative: Use pg_partman if already configured, or create a backend scheduled task.

---

## Phase 2: Backend Handler Changes

### 2.1 Update Delete Handlers

Change delete operations from hard delete to soft delete:

```typescript
// backend/src/modules/attachment/attachment-handlers.ts

.openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
  const ids = ctx.req.valid('body');
  const organization = getContextOrganization();
  
  // Soft delete: set deletedAt and update modifiedAt
  const deletedAt = getIsoDate();
  
  await db
    .update(attachmentsTable)
    .set({ 
      deletedAt,
      modifiedAt: deletedAt,  // Important: update modifiedAt for delta sync
    })
    .where(and(
      inArray(attachmentsTable.id, ids),
      eq(attachmentsTable.organizationId, organization.id),
      isNull(attachmentsTable.deletedAt),  // Only delete active items
    ));
    
  // ... rest of handler (CDC will pick up the update)
});
```

### 2.2 Update List Handlers

Exclude soft-deleted items by default, include when syncing:

```typescript
// backend/src/modules/attachment/attachment-handlers.ts

.openapi(attachmentRoutes.getAttachments, async (ctx) => {
  const { q, sort, order, limit, offset, modifiedAfter, includeDeleted } = ctx.req.valid('query');
  
  const organization = getContextOrganization();
  const filters: SQL[] = [eq(attachmentsTable.organizationId, organization.id)];
  
  // Delta sync mode: include soft-deleted items
  if (modifiedAfter) {
    filters.push(gt(attachmentsTable.modifiedAt, modifiedAfter));
    // Include deleted items in delta - client needs to know what was deleted
  } else if (!includeDeleted) {
    // Normal mode: exclude soft-deleted items
    filters.push(isNull(attachmentsTable.deletedAt));
  }
  
  // ... existing query logic ...
  
  // Calculate sync cursor from results
  const syncCursor = items.length > 0
    ? items.reduce((max, item) => 
        item.modifiedAt && item.modifiedAt > max ? item.modifiedAt : max, 
        items[0].modifiedAt ?? modifiedAfter
      )
    : modifiedAfter ?? null;
  
  return ctx.json({ items, total, syncCursor }, 200);
});
```

### 2.3 Update Get Single Handlers

Allow fetching soft-deleted items for sync purposes:

```typescript
// backend/src/modules/attachment/attachment-handlers.ts

.openapi(attachmentRoutes.getAttachment, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const { allowDeleted } = ctx.req.valid('query');
  
  const filters = [eq(attachmentsTable.id, id)];
  
  // Only exclude deleted if not explicitly allowed
  if (!allowDeleted) {
    filters.push(isNull(attachmentsTable.deletedAt));
  }
  
  const attachment = await db.query.attachments.findFirst({
    where: and(...filters),
  });
  
  if (!attachment) {
    throw createError(ctx, 404, 'not_found', 'warn', 'attachment');
  }
  
  return ctx.json(attachment, 200);
});
```

### 2.4 Update Route Schemas

```typescript
// backend/src/modules/attachment/attachment-routes.ts

const getAttachmentsQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['name', 'createdAt', 'contentType']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  offset: z.string().optional(),
  limit: z.string().optional(),
  // New: delta sync parameters
  modifiedAfter: z.string().datetime().optional()
    .openapi({ description: 'Return items modified after this ISO timestamp (includes deleted)' }),
  includeDeleted: z.coerce.boolean().optional()
    .openapi({ description: 'Include soft-deleted items in results' }),
});

const getAttachmentsResponseSchema = z.object({
  items: z.array(attachmentSchema),
  total: z.number(),
  // New: sync cursor for next delta fetch
  syncCursor: z.string().nullable().optional()
    .openapi({ description: 'Cursor for next delta sync (latest modifiedAt)' }),
});
```

### 2.5 Update Entity Schema

Add `deletedAt` to API response schema:

```typescript
// backend/src/modules/attachment/attachment-schema.ts

export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  // ... existing fields ...
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  // New: soft delete indicator
  deletedAt: z.string().nullable()
    .openapi({ description: 'Soft delete timestamp, null if active' }),
});
```

---

## Phase 3: CDC Worker Updates

### 3.1 Handle Soft Delete in CDC

CDC should treat soft delete updates like any other update:

```typescript
// cdc/src/handlers/entity-handler.ts

// Soft delete is just an UPDATE with deletedAt set
// CDC already handles updates, no special logic needed
// The tx.fieldVersions will include 'deletedAt' as changed field
```

### 3.2 Stream Notification for Soft Delete

SSE notifications should indicate soft delete:

```typescript
// Notification includes the action as 'update' (not 'delete')
// Client checks entity.deletedAt to know it was soft-deleted
{
  action: 'update',  // Still 'update', not 'delete'
  entityType: 'attachment',
  entityId: 'abc123',
  // Client fetches entity, sees deletedAt is set
}
```

**Alternative**: Add new action type for soft delete:

```typescript
// Option: Use 'archive' action for soft delete
action: 'archive' | 'create' | 'update' | 'delete'
```

---

## Phase 4: Frontend Changes

### 4.1 Update Generated Types

After schema changes, regenerate:

```bash
pnpm generate:openapi
```

Types will include:
```typescript
interface Attachment {
  // ... existing fields ...
  deletedAt: string | null;
}

interface GetAttachmentsResponse {
  items: Attachment[];
  total: number;
  syncCursor?: string | null;
}
```

### 4.2 Update List Components

Filter out soft-deleted items in UI:

```typescript
// frontend/src/modules/attachment/table/attachment-table.tsx

const activeItems = useMemo(
  () => items.filter(item => !item.deletedAt),
  [items]
);
```

### 4.3 Handle Soft Delete in Cache

```typescript
// frontend/src/modules/attachment/query.ts

// In mutation success handler, don't remove from cache
// Just update the item with deletedAt set
onSuccess: (_, variables) => {
  // Soft delete: update cache with deletedAt
  mutateCache.update(variables.ids.map(id => ({
    id,
    deletedAt: new Date().toISOString(),
  })));
},
```

---

## Phase 5: Cleanup Job

### 5.1 Backend Scheduled Task

```typescript
// backend/scripts/cleanup-soft-deleted.ts

import { db } from '#/db/db';
import { attachmentsTable, pagesTable } from '#/db/schema';
import { and, isNotNull, lt } from 'drizzle-orm';

const RETENTION_DAYS = 30;

export async function cleanupSoftDeleted() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();
  
  // Hard delete attachments
  const attachmentResult = await db
    .delete(attachmentsTable)
    .where(and(
      isNotNull(attachmentsTable.deletedAt),
      lt(attachmentsTable.deletedAt, cutoffIso),
    ));
    
  // Hard delete pages  
  const pageResult = await db
    .delete(pagesTable)
    .where(and(
      isNotNull(pagesTable.deletedAt),
      lt(pagesTable.deletedAt, cutoffIso),
    ));
    
  console.info(`[Cleanup] Hard deleted ${attachmentResult.count} attachments, ${pageResult.count} pages`);
}
```

### 5.2 Schedule Execution

Option A: pg_cron (database-level):
```sql
SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * *', 
  $$SELECT cleanup_soft_deleted_entities()$$);
```

Option B: External scheduler (render.yaml, GitHub Actions, etc.):
```yaml
# render.yaml
services:
  - type: cron
    name: cleanup-soft-deleted
    schedule: "0 3 * * *"
    buildCommand: pnpm install
    startCommand: pnpm run cleanup:soft-deleted
```

---

## Migration Strategy

### Step 1: Add columns (non-breaking)
- Add `deletedAt` column as nullable
- Add indexes
- Deploy backend

### Step 2: Update delete handlers
- Change hard delete to soft delete
- Update list handlers to filter by default
- Deploy backend

### Step 3: Update frontend
- Regenerate types
- Update cache handling
- Filter deleted items in UI
- Deploy frontend

### Step 4: Enable cleanup job
- Verify soft delete working correctly
- Enable scheduled cleanup after 30 days

---

## Rollback Plan

If issues arise:
1. Disable cleanup job
2. Run hard delete on all soft-deleted items:
   ```sql
   DELETE FROM attachments WHERE deleted_at IS NOT NULL;
   DELETE FROM pages WHERE deleted_at IS NOT NULL;
   ```
3. Remove `deletedAt` filter from list handlers
4. Revert delete handlers to hard delete

---

## Testing Checklist

- [ ] New items don't have `deletedAt` set
- [ ] Delete sets `deletedAt` and `modifiedAt`
- [ ] List excludes deleted by default
- [ ] List with `modifiedAfter` includes deleted
- [ ] Single get excludes deleted by default
- [ ] Single get with `allowDeleted` returns deleted
- [ ] UI filters out deleted items
- [ ] Cache properly handles soft delete
- [ ] Cleanup job runs and hard deletes after 30 days
- [ ] CDC properly tracks soft delete as update
- [ ] SSE notification sent for soft delete
