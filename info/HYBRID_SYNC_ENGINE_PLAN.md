# Cella Hybrid Sync Engine Plan

**Status**: Draft Proposal (v2)  
**Date**: January 2026  
**Author**: Engineering Team

## Executive Summary

This document outlines a plan to build a lightweight hybrid sync engine that extends Cella's existing OpenAPI + React Query infrastructure with optional sync and offline capabilities for product entities. The approach is "hybrid" because it maintains standard REST/OpenAPI endpoints as the default while allowing product entities to opt-in to enhanced sync and offline features.

**Key Architectural Decision (v2)**: Leverage the existing CDC (Change Data Capture) infrastructure and `activitiesTable` for transaction tracking, avoiding the need for a separate transaction log table.

---

## Part 1: Research & Analysis

### 1.1 Study of LiveStore Architecture

Key learnings from LiveStore's design:

| Concept | Description | Cella Applicability |
|---------|-------------|---------------------|
| **Event Sourcing** | All mutations are events with immutable history | Partial - we use CRUD, but add transaction tracking |
| **Eventlog** | Single source of truth for changes | ✅ `activitiesTable` via CDC serves this purpose |
| **Push/Pull Model** | Git-like sync with rebasing | Consider for conflict resolution |
| **Materializers** | Events → SQLite state | React Query cache + Electric shapes |
| **Sync Heads** | Track sync position per client | ✅ Transaction IDs enable precise tracking |
| **Deterministic Mutations** | Client-generated IDs, side-effect free | ✅ Adopt for product entities |

**Key Insight**: LiveStore separates read/write models via event sourcing. Cella achieves similar benefits using transaction IDs tracked through the existing CDC pipeline, without adopting full event sourcing.

**LiveStore Syncing Model**: Uses push/pull with rebasing - "upstream events always need to be pulled before a client can push." This informs our conflict detection strategy.

### 1.2 Study of Electric SQL + TanStack DB

**Current Cella State (as of rewrite branch)**:

The `attachments` and `pages` modules use standard **TanStack Query (React Query)** with REST APIs:

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
│              useQuery / useSuspenseQuery                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TanStack Query                                  │
│            - Query caching                                   │
│            - Optimistic mutations via onMutate               │
│            - Persisted to IndexedDB via Dexie                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    REST API (Hono + OpenAPI)                 │
│              (Standard request/response cycle)               │
└─────────────────────────────────────────────────────────────┘
```

**Electric Write Patterns** (from official docs):

1. **Online Writes** - Simple REST, network on write path
2. **Optimistic State** - Component-scoped, ephemeral
3. **Shared Persistent Optimistic State** - ✅ **Recommended for Cella**
4. **Through-the-Database Sync** - Full local-first (complex)

**Pattern 3 Insights**:
- Separate synced state from optimistic state, merge on-read
- Use `matchStream` to wait for writes to sync back (not just API response)
- Store `write_id` in entity row for precise matching
- Rollback strategy: individual writes can be rolled back with context

**Electric SSE Support**:
- SSE for live updates with automatic fallback to long-poll
- `log=changes_only` mode skips initial snapshot
- `offset=now` starts from current position

**Current Cella Strengths**:
- TanStack Query provides caching, optimistic updates, persistence (via Dexie)
- OpenAPI-first architecture with generated SDK
- CDC infrastructure with activitiesTable for audit logging

**Gaps to Address** (this plan):
- No realtime sync → Introduce Electric shapes for product entities
- No transaction tracking → Add `transactions` column + CDC extraction
- No offline write queue → Consider offline executor for product entities
- No sync confirmation → Use transaction ID matching via Electric stream

### 1.3 Study of Durable Streams Protocol

The [Durable Streams](https://github.com/durable-streams/durable-streams) protocol provides:

| Feature | Description |
|---------|-------------|
| **Offset-based resumption** | Clients resume from last position |
| **CDN-friendly** | Same offset = same data, cacheable |
| **Live tailing** | Long-poll or SSE for real-time |
| **Content-type agnostic** | Works with JSON, binary, etc. |
| **HTTP-native** | Standard HTTP, no custom protocols |

**Key Operations**:
```bash
# Create stream
PUT /stream/{path}

# Append data
POST /stream/{path}

# Read from offset (catch-up)
GET /stream/{path}?offset=-1

# Live tail
GET /stream/{path}?offset=X&live=long-poll
```

**Relevance**: This pattern can be adapted to "streamify" existing Hono GET list endpoints.

---

## Part 2: Design Principles

### 2.1 Core Philosophy

1. **Opt-in Complexity**: Regular entities remain simple REST. Sync/offline is additive.
2. **OpenAPI-First**: All features work through the existing OpenAPI infrastructure.
3. **React Query Native**: Build on top of, not around, TanStack Query.
4. **Leverage Existing CDC**: Use `activitiesTable` for transaction history, not a new table.
5. **Transaction Traceability**: Every mutation trackable end-to-end via transaction IDs.
6. **Progressive Enhancement**: Start with optimistic updates → add offline → add realtime.
7. **Client-Generated IDs**: Product entities use client-generated IDs for determinism.

### 2.2 Entity Tiers

| Tier | Features | Example |
|------|----------|---------|
| **Basic** | REST CRUD, server-generated IDs | Context entities (organizations) |
| **Tracked** | + Transaction IDs, client IDs, CDC logging | Product entities (pages, attachments) |
| **Offline** | + IndexedDB persistence, mutation queue | Product entities with offline |
| **Realtime** | + Electric sync, live queries | Heavy-use product entities |

---

## Part 3: Architecture Design

### 3.1 Transaction Tracking Schema

**Entity Row Structure** - Fixed size, never grows:

```typescript
// In product entity tables (pages, attachments, etc.)
transactions: {
  insert: string;        // Transaction ID when created (never changes)
  update: string | null; // Transaction ID of last update (replaced each time)
  delete: string | null; // Transaction ID if soft-deleted
}

lastClientId: string | null;  // Last client device that modified this
```

**Benefits**:
- **Fixed size**: Always 3 fields, no row bloat
- **Complete lifecycle**: Know who created, last updated, and deleted
- **Electric compatible**: JSONB flows through shapes naturally
- **Fast matching**: Check any of the 3 transaction IDs for reconciliation

### 3.2 Leveraging Existing CDC Infrastructure

Cella already has a robust CDC system with `activitiesTable`. Extend it for transaction tracking:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: Create Page                                                │
│ const transactionId = nanoid();                                      │
│ api.createPage({ body, headers: { 'X-Transaction-Id': transactionId } }) │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Handler                                                      │
│ INSERT INTO pages (..., transactions = {insert: $txId, ...})         │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PostgreSQL Logical Replication → CDC Worker                         │
│ Extracts transactionId from row.transactions based on action         │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ activitiesTable (Extended)                                           │
│ { type: 'page.created', entityId: 'abc', transactionId: 'xyz123',   │
│   clientId: 'client_001', changedKeys: null }                        │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Electric Shape syncs page with transactions.insert = 'xyz123'        │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: Reconcile pending transactions                             │
│ if (syncedPage.transactions.insert === pendingTx.id) { confirm(); }  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Extended activitiesTable Schema

```typescript
// backend/src/db/schema/activities.ts - additions
export const activitiesTable = pgTable('activities', {
  // ... existing columns
  
  // NEW: Transaction tracking for sync/optimistic matching
  transactionId: varchar(),  // From entity's transactions.insert/update/delete
  clientId: varchar(),       // Client device identifier
  
}, (table) => [
  // ... existing indexes
  index('activities_transaction_id_index').on(table.transactionId),
  index('activities_client_id_index').on(table.clientId),
]);
```

### 3.4 Extended CDC Context Extraction

```typescript
// cdc/src/utils/extract-activity-context.ts - additions
export interface ActivityContext {
  // ... existing
  transactionId: string | null;  // NEW
  clientId: string | null;       // NEW
}

export function extractActivityContext(
  entry: TableRegistryEntry,
  row: Record<string, unknown>,
  action: 'create' | 'update' | 'delete',
): ActivityContext {
  // ... existing extraction

  // NEW: Extract transaction ID based on action type
  const transactions = row.transactions as { 
    insert?: string; 
    update?: string; 
    delete?: string; 
  } | null;
  
  let transactionId: string | null = null;
  if (transactions) {
    switch (action) {
      case 'create':
        transactionId = transactions.insert ?? null;
        break;
      case 'update':
        transactionId = transactions.update ?? null;
        break;
      case 'delete':
        transactionId = transactions.delete ?? null;
        break;
    }
  }

  const clientId = getRowValue(row, 'lastClientId') ?? null;

  return {
    // ... existing
    transactionId,
    clientId,
  };
}
```

### 3.5 Frontend Mutation Pattern with Transactions

Extend the current `usePageCreateMutation` pattern:

```typescript
// frontend/src/modules/pages/query.ts
export const usePageCreateMutation = () => {
  const qc = useQueryClient();
  const clientId = useClientId(); // Persisted in localStorage
  const { trackTransaction, pendingTransactions } = useTransactionManager();
  
  return useMutation({
    mutationKey: keys.create,
    
    mutationFn: async (data: CreatePageInput, context: { transactionId: string }) => {
      return createPage({ 
        body: {
          id: data.id, // Client-generated ID
          ...data,
          transactions: { insert: context.transactionId, update: null, delete: null },
          lastClientId: clientId,
        },
        headers: {
          'X-Transaction-Id': context.transactionId,
          'X-Client-Id': clientId,
        }
      });
    },
    
    onMutate: async (newData) => {
      const transactionId = createTransactionId();
      const optimisticEntity = createOptimisticEntity(zPage, {
        ...newData,
        id: newData.id || nanoid(),
        transactions: { insert: transactionId, update: null, delete: null },
      });
      
      // Track pending transaction
      trackTransaction(transactionId, {
        type: 'create',
        entity: 'page',
        entityId: optimisticEntity.id,
        status: 'pending',
      });
      
      mutateCache.create([optimisticEntity]);
      return { transactionId, optimisticEntity };
    },
    
    onSuccess: (serverEntity, _vars, context) => {
      trackTransaction(context.transactionId, { status: 'sent' });
      // Note: Final 'confirmed' status set when Electric sync delivers the entity
    },
    
    onError: (_err, _vars, context) => {
      if (context) {
        trackTransaction(context.transactionId, { status: 'failed' });
        mutateCache.remove([context.optimisticEntity]);
      }
    },
  });
};
```

### 3.6 Sync Confirmation via Electric Stream

Use Electric's `matchStream` pattern to confirm writes:

```typescript
// frontend/src/lib/sync/match-transaction.ts
import { matchStream, matchBy } from '@electric-sql/experimental';

/**
 * Wait for a transaction to appear in the Electric stream.
 * This confirms the write has synced back from the server.
 */
export async function waitForTransactionSync(
  stream: ShapeStream,
  transactionId: string,
  operation: 'insert' | 'update' | 'delete',
): Promise<void> {
  const field = `transactions.${operation === 'insert' ? 'insert' : operation === 'update' ? 'update' : 'delete'}`;
  
  await matchStream(
    stream,
    [operation],
    matchBy(field, transactionId),
  );
}

// Usage in component or effect
useEffect(() => {
  const unconfirmedTxs = pendingTransactions.filter(tx => tx.status === 'sent');
  
  for (const tx of unconfirmedTxs) {
    waitForTransactionSync(pagesStream, tx.id, tx.type).then(() => {
      trackTransaction(tx.id, { status: 'confirmed' });
      pendingTransactions.delete(tx.id);
    });
  }
}, [pagesStream, pendingTransactions]);
```

### 3.7 Optimistic Lock via Expected Transaction

For conflict detection without full event sourcing:

```typescript
// Frontend: Include expected transaction in update
async function updatePage(pageId: string, updates: Partial<Page>) {
  const currentPage = queryClient.getQueryData(['pages', pageId]);
  const expectedTx = currentPage.transactions.update ?? currentPage.transactions.insert;
  
  return api.updatePage({
    body: updates,
    params: { pageId },
    headers: {
      'X-Transaction-Id': createTransactionId(),
      'X-Expected-Transaction-Id': expectedTx, // Optimistic lock
    },
  });
}

// Backend: Verify no concurrent modifications
app.openapi(routes.updatePage, async (ctx) => {
  const expectedTxId = ctx.req.header('X-Expected-Transaction-Id');
  const newTxId = ctx.req.header('X-Transaction-Id') || nanoid();
  
  const [current] = await db.select()
    .from(pagesTable)
    .where(eq(pagesTable.id, pageId));
  
  const currentTx = current.transactions.update ?? current.transactions.insert;
  
  if (expectedTxId && currentTx !== expectedTxId) {
    // Conflict: someone else modified since client last fetched
    return ctx.json({
      error: 'conflict',
      code: 'TRANSACTION_CONFLICT',
      serverVersion: current,
      expectedTransaction: expectedTxId,
      actualTransaction: currentTx,
    }, 409);
  }
  
  // Update with new transaction ID
  const [page] = await db.update(pagesTable)
    .set({
      ...body,
      transactions: sql`jsonb_set(${pagesTable.transactions}, '{update}', '"${newTxId}"')`,
      lastClientId: ctx.req.header('X-Client-Id'),
    })
    .where(eq(pagesTable.id, pageId))
    .returning();
  
  return ctx.json(page, 200, { 'X-Transaction-Id': newTxId });
});
```

### 3.8 Idempotency via activitiesTable

```typescript
// backend/src/lib/idempotency.ts

/**
 * Check if a transaction has already been processed.
 * Uses the CDC-populated activitiesTable as the source of truth.
 */
export async function isTransactionProcessed(
  db: DbClient,
  transactionId: string,
): Promise<boolean> {
  const existing = await db.select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(eq(activitiesTable.transactionId, transactionId))
    .limit(1);
  
  return existing.length > 0;
}

/**
 * Get the entity created/modified by a transaction.
 */
export async function getEntityByTransaction(
  db: DbClient,
  transactionId: string,
): Promise<{ entityType: string; entityId: string } | null> {
  const [activity] = await db.select({
    entityType: activitiesTable.entityType,
    entityId: activitiesTable.entityId,
  })
    .from(activitiesTable)
    .where(eq(activitiesTable.transactionId, transactionId))
    .limit(1);
  
  return activity ?? null;
}

// Usage in handler
app.openapi(routes.createPage, async (ctx) => {
  const transactionId = ctx.req.header('X-Transaction-Id');
  
  if (transactionId && await isTransactionProcessed(db, transactionId)) {
    // Idempotent: return existing entity
    const ref = await getEntityByTransaction(db, transactionId);
    if (ref) {
      const [existing] = await db.select()
        .from(pagesTable)
        .where(eq(pagesTable.id, ref.entityId));
      
      return ctx.json(existing, 200, { 'X-Idempotent-Hit': 'true' });
    }
  }
  
  // First time - process normally
  // ...
});
```

---

## Part 4: Implementation TODO List

### Phase 1: Schema & CDC Extensions (Foundation)

- [ ] **1.1** Add transaction tracking columns to product entity schemas
  - Files: `backend/src/db/schema/pages.ts`, `attachments.ts`
  - Columns: `transactions` (JSONB), `lastClientId` (VARCHAR)
  - Create migration

- [ ] **1.2** Extend `activitiesTable` with transaction columns
  - File: `backend/src/db/schema/activities.ts`
  - Add: `transactionId`, `clientId` columns
  - Add indexes for both columns

- [ ] **1.3** Update CDC context extraction
  - File: `cdc/src/utils/extract-activity-context.ts`
  - Extract `transactionId` based on action type from `transactions` column
  - Extract `clientId` from `lastClientId` column

- [ ] **1.4** Update CDC handlers to include transaction info
  - Files: `cdc/src/handlers/insert.ts`, `update.ts`, `delete.ts`
  - Pass action type to `extractActivityContext`
  - Include `transactionId`, `clientId` in activity record

### Phase 2: Frontend Transaction Infrastructure

- [ ] **2.1** Create `transactionId` utility
  - Location: `frontend/src/lib/sync/transaction.ts`
  - Format: `{timestamp_base36}-{nanoid(12)}`

- [ ] **2.2** Create persistent `clientId` store
  - Location: `frontend/src/store/client.ts`
  - Use localStorage with fallback to crypto.randomUUID()
  - Persist across sessions

- [ ] **2.3** Create transaction manager hook
  - Location: `frontend/src/lib/sync/use-transaction-manager.ts`
  - Track pending transactions in memory + IndexedDB
  - States: `pending` → `sent` → `confirmed` | `failed`

- [ ] **2.4** Update API client configuration
  - File: `frontend/src/api.gen/` custom config
  - Auto-inject `X-Client-Id` header on all requests

### Phase 3: Mutation Hook Updates

- [ ] **3.1** Update `usePageCreateMutation`
  - File: `frontend/src/modules/pages/query.ts`
  - Generate transaction ID in `onMutate`
  - Include in request headers
  - Set `transactions.insert` in entity body
  - Track with transaction manager

- [ ] **3.2** Update `usePageUpdateMutation`
  - Add expected transaction header for conflict detection
  - Set `transactions.update` in entity body

- [ ] **3.3** Update `usePageDeleteMutation`
  - Set `transactions.delete` for soft deletes

- [ ] **3.4** Apply same pattern to attachments module

### Phase 4: Backend Handler Updates

- [ ] **4.1** Create transaction middleware
  - Location: `backend/src/middlewares/transaction.ts`
  - Extract `X-Transaction-Id`, `X-Client-Id` from headers
  - Store in context for handlers

- [ ] **4.2** Create idempotency utilities
  - Location: `backend/src/lib/idempotency.ts`
  - `isTransactionProcessed()` - check activitiesTable
  - `getEntityByTransaction()` - lookup entity by transaction

- [ ] **4.3** Update page handlers
  - File: `backend/src/modules/pages/pages-handlers.ts`
  - Set `transactions` and `lastClientId` on create/update
  - Implement idempotency check
  - Implement conflict detection on update

- [ ] **4.4** Apply same pattern to attachments handlers

### Phase 5: Sync Confirmation

- [ ] **5.1** Create match transaction utility
  - Location: `frontend/src/lib/sync/match-transaction.ts`
  - Wrap Electric's `matchStream` for transaction matching
  - Handle timeout/error cases

- [ ] **5.2** Integrate with Electric shapes
  - Update pages/attachments Electric sync hooks
  - Auto-confirm transactions when they appear in stream

- [ ] **5.3** Add transaction status UI indicators
  - Hook: `useTransactionStatus(transactionId)`
  - Visual states: pending spinner, syncing, confirmed checkmark, failed error

### Phase 6: Offline Enhancement

- [ ] **6.1** Add transaction tracking to offline executor
  - File: `frontend/src/modules/attachments/offline/executor.ts`
  - Include `transactionId` in persisted mutations
  - Same transaction ID across retries (idempotency)

- [ ] **6.2** Create rollback strategy
  - Individual rollback: remove single failed transaction
  - Cascade rollback: remove dependent transactions
  - Notify user of rollback with context

- [ ] **6.3** Add transaction log viewer (debug mode)
  - Enable via `VITE_DEBUG_MODE=true`
  - Show pending/confirmed/failed transactions
  - Show activitiesTable entries for debugging

---

## Part 5: Technical Specifications

### 5.1 Transaction ID Format

```typescript
// 21-character nanoid for uniqueness + timestamp prefix for sorting
const createTransactionId = () => {
  const timestamp = Date.now().toString(36); // Base36 timestamp
  const random = nanoid(12);
  return `${timestamp}-${random}`;
};

// Example: "lz2x8g-a1b2c3d4e5f6"
```

### 5.2 Entity Transaction Column Structure

```typescript
// JSONB column in product entity tables
interface EntityTransactions {
  insert: string;        // Required - set on create, never changes
  update: string | null; // Set on each update, replaced
  delete: string | null; // Set on soft delete
}

// Size: Fixed 3 fields, ~100-200 bytes max
// Index: GIN on transactions or functional index on transactions->>'insert'
```

### 5.3 HTTP Headers for Sync

| Header | Direction | Purpose |
|--------|-----------|---------|
| `X-Transaction-Id` | Request | Unique mutation identifier |
| `X-Client-Id` | Request | Persistent client device identifier |
| `X-Expected-Transaction-Id` | Request | Optimistic lock for updates |
| `X-Idempotent-Hit` | Response | Indicates duplicate request was detected |

### 5.4 Transaction Lifecycle States

```
┌──────────┐    onMutate     ┌──────────┐    API success    ┌──────────┐
│  (none)  │ ───────────────>│ pending  │ ─────────────────>│   sent   │
└──────────┘                 └──────────┘                   └──────────┘
                                  │                              │
                                  │ API error                    │ Electric sync
                                  ▼                              ▼
                             ┌──────────┐                   ┌───────────┐
                             │  failed  │                   │ confirmed │
                             └──────────┘                   └───────────┘
```

### 5.5 Conflict Resolution Strategy

Default: **Last-Write-Wins** with optional optimistic locking

```typescript
interface ConflictResponse {
  error: 'conflict';
  code: 'TRANSACTION_CONFLICT';
  serverVersion: Entity;           // Current server state
  expectedTransaction: string;     // What client expected
  actualTransaction: string;       // What server has
}

// Frontend handling
async function handleConflict(conflict: ConflictResponse) {
  // Option 1: Auto-resolve with server version (LWW)
  queryClient.setQueryData(['entity', id], conflict.serverVersion);
  
  // Option 2: Notify user
  toast.error('This item was modified by someone else');
  
  // Option 3: Manual merge (future enhancement)
  // showConflictResolutionDialog(localChanges, conflict.serverVersion);
}
```

### 5.6 Activity Table Query Patterns

```typescript
// Is this transaction already processed? (idempotency)
SELECT id FROM activities 
WHERE transaction_id = $1 
LIMIT 1;

// Get full history for an entity
SELECT * FROM activities 
WHERE entity_type = 'page' AND entity_id = $1 
ORDER BY created_at;

// All activities by a client (debugging)
SELECT * FROM activities 
WHERE client_id = $1 
ORDER BY created_at DESC 
LIMIT 100;

// Recent activities for organization (activity feed)
SELECT * FROM activities 
WHERE organization_id = $1 
ORDER BY created_at DESC 
LIMIT 50;

// Find entity by transaction
SELECT entity_type, entity_id FROM activities 
WHERE transaction_id = $1 
LIMIT 1;
```

---

## Part 6: Migration Path

### For Existing Entities

1. **Add schema columns** (non-breaking)
   - Add `transactions` JSONB column with default `{}`
   - Add `lastClientId` column with default `null`
   - Add indexes

2. **Extend activitiesTable** (non-breaking)
   - Add `transactionId`, `clientId` columns (nullable)
   - Add indexes

3. **Update CDC handlers**
   - Extract transaction info when available
   - Backwards compatible: old rows without transactions still work

4. **Update backend handlers incrementally**
   - Add transaction support to handlers one by one
   - Old clients without `X-Transaction-Id` still work

5. **Update frontend mutation hooks**
   - Add transaction tracking
   - Backwards compatible: works with old backend until updated

### For New Product Entities

Use the `createSyncedEntity` factory (Phase 7) or follow this checklist:

1. Add `transactions` and `lastClientId` columns to schema
2. Register table in CDC tracked tables
3. Create mutation hooks with transaction tracking
4. Configure Electric shape if realtime sync needed
5. Add to offline executor if offline support needed

---

## Part 7: Future Enhancements

### 7.1 Sync Engine Abstraction (Phase 7)

```typescript
// frontend/src/lib/sync/create-synced-entity.ts
interface SyncEntityConfig<T> {
  name: string;
  schema: z.ZodSchema<T>;
  mode: 'rest' | 'electric';
  offlineEnabled: boolean;
  conflictResolution: 'lww' | 'optimistic-lock';
}

function createSyncedEntity<T>(config: SyncEntityConfig<T>) {
  return {
    queryOptions: createQueryOptions(config),
    useCreate: createCreateMutation(config),
    useUpdate: createUpdateMutation(config),
    useDelete: createDeleteMutation(config),
    useTransactionStatus: createTransactionStatusHook(config),
  };
}

// Usage
const pageSync = createSyncedEntity({
  name: 'page',
  schema: zPage,
  mode: 'electric',
  offlineEnabled: true,
  conflictResolution: 'optimistic-lock',
});

export const { queryOptions, useCreate, useUpdate, useDelete } = pageSync;
```

### 7.2 Custom Streaming for Non-Electric Entities

If needed for entities that don't use Electric:

```typescript
// Backend: SSE endpoint using activitiesTable as change feed
app.get('/api/activities/stream', async (ctx) => {
  const { entityType, since } = ctx.req.query();
  
  return streamSSE(ctx, async (stream) => {
    let cursor = since;
    
    while (true) {
      const activities = await db.select()
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.entityType, entityType),
          cursor ? gt(activitiesTable.createdAt, cursor) : sql`true`,
        ))
        .orderBy(activitiesTable.createdAt)
        .limit(100);
      
      for (const activity of activities) {
        await stream.write({
          data: JSON.stringify(activity),
          id: activity.id,
        });
        cursor = activity.createdAt;
      }
      
      await sleep(1000);
    }
  });
});
```

### 7.3 Rollback with Previous Values

For full rollback capability, store previous values in activities:

```typescript
// Extended activitiesTable
previousValues: jsonb().$type<Record<string, unknown>>(),

// CDC handler stores old values on update
export function handleUpdate(entry, message): InsertActivityModel {
  const oldRow = convertRowKeys(extractRowData(message.old));
  const newRow = convertRowKeys(extractRowData(message.new));
  
  return {
    // ... existing fields
    previousValues: oldRow, // Store for rollback
  };
}

// Rollback function
async function rollbackTransaction(transactionId: string) {
  const [activity] = await db.select()
    .from(activitiesTable)
    .where(eq(activitiesTable.transactionId, transactionId));
  
  if (activity.action === 'create') {
    // Delete the created entity
    await db.delete(getTable(activity.entityType))
      .where(eq(table.id, activity.entityId));
  } else if (activity.action === 'update' && activity.previousValues) {
    // Restore previous values
    await db.update(getTable(activity.entityType))
      .set(activity.previousValues)
      .where(eq(table.id, activity.entityId));
  }
}
```

---

## Part 8: Open Questions

1. **Previous Values Storage**: Should we store `previousValues` in activitiesTable for full rollback?
   - Pro: Enables undo/rollback
   - Con: Increases storage significantly
   - Suggestion: Make it configurable per entity type

2. **Activities Retention**: How long to keep activities?
   - Options: Partition by month, archive after N months
   - Transaction lookup only needs recent entries (TTL approach)

3. **Electric vs Custom Streaming**: When to use which?
   - Electric: Full table shapes, complex queries, built-in sync
   - Custom: Specific change feeds, non-synced entities, activity streams

4. **Client ID Persistence**: How to handle client ID across devices?
   - Current: One `clientId` per browser/device (localStorage)
   - Question: Should we link to user for cross-device tracking?

5. **Conflict UI**: How should conflicts be presented to users?
   - Simple: Toast notification, auto-resolve with server version
   - Advanced: Side-by-side diff, manual merge (future)

---

## Part 9: References

### External Documentation
- [Electric SQL Write Patterns](https://electric-sql.com/docs/guides/writes)
- [Electric SQL Shapes](https://electric-sql.com/docs/guides/shapes)
- [Electric SQL TanStack Integration](https://electric-sql.com/docs/integrations/tanstack)
- [LiveStore Syncing](https://docs.livestore.dev/reference/syncing/)
- [LiveStore Events](https://docs.livestore.dev/reference/events/)
- [LiveStore Materializers](https://docs.livestore.dev/reference/state/materializers/)

### Cella Internal
- [backend/src/db/schema/activities.ts](../backend/src/db/schema/activities.ts) - Activities table schema
- [cdc/](../cdc/) - CDC worker and handlers
- [frontend/src/modules/pages/query.ts](../frontend/src/modules/pages/query.ts) - Current mutation pattern
- [frontend/src/modules/attachments/README.md](../frontend/src/modules/attachments/README.md) - Sync architecture
- [backend/src/utils/electric-utils.ts](../backend/src/utils/electric-utils.ts) - Electric proxy

---

## Appendix A: Comparison Matrix

| Feature | Current Cella | LiveStore | Electric | Proposed Hybrid |
|---------|---------------|-----------|----------|-----------------|
| Data Model | CRUD/REST | Event Sourcing | Shapes | CRUD + Transactions |
| Local Storage | IndexedDB (RQ persister) | SQLite WASM | TanStack DB | IndexedDB (RQ) + optional TanStack DB |
| Sync Protocol | None (REST only) | Push/Pull events | HTTP shapes | Electric shapes + activitiesTable |
| Offline Writes | ❌ None | ✅ Eventlog | ❌ | ✅ Outbox + TxID |
| Optimistic Updates | ✅ Manual (onMutate) | ✅ Automatic | ⚠️ Patterns | ✅ Transaction-tracked |
| Conflict Resolution | None | Rebase | LWW | LWW + Optimistic Lock |
| Transaction Tracking | ❌ | ✅ Full | ❌ | ✅ Per-operation |
| Audit Trail | ✅ activitiesTable | ✅ Eventlog | ❌ | ✅ Enhanced activities |
| CDC Integration | ✅ Existing | N/A | ❌ | ✅ Extended |
| Realtime Updates | ❌ | ✅ | ✅ | ✅ (opt-in via Electric) |

---

## Appendix B: Schema Changes Summary

### Product Entity Tables (pages, attachments)

```sql
-- Add transaction tracking
ALTER TABLE pages ADD COLUMN transactions JSONB DEFAULT '{}';
ALTER TABLE pages ADD COLUMN last_client_id VARCHAR;

-- Index for transaction lookups
CREATE INDEX idx_pages_tx_insert ON pages ((transactions->>'insert'));
```

### Activities Table

```sql
-- Add transaction and client tracking
ALTER TABLE activities ADD COLUMN transaction_id VARCHAR;
ALTER TABLE activities ADD COLUMN client_id VARCHAR;

-- Indexes for lookups
CREATE INDEX idx_activities_transaction_id ON activities (transaction_id);
CREATE INDEX idx_activities_client_id ON activities (client_id);
```

---

## Appendix C: Example Migration

### Before (Current Pattern)

```typescript
// frontend/src/modules/pages/query.ts
export const usePageCreateMutation = () => {
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationFn: (body) => createPage({ body }),
    onMutate: async (newData) => {
      const optimistic = createOptimisticEntity(zPage, newData);
      mutateCache.create([optimistic]);
      return { optimistic };
    },
    // ... error handling
  });
};
```

### After (With Transaction Tracking)

```typescript
// frontend/src/modules/pages/query.ts  
export const usePageCreateMutation = () => {
  const mutateCache = useMutateQueryData(keys.list.base);
  const clientId = useClientId();
  const { trackTransaction } = useTransactionManager();

  return useMutation({
    mutationFn: (body, context) => createPage({ 
      body: {
        ...body,
        id: body.id || nanoid(), // Client-generated
        transactions: { insert: context.transactionId, update: null, delete: null },
        lastClientId: clientId,
      },
      headers: { 
        'X-Transaction-Id': context.transactionId,
        'X-Client-Id': clientId,
      }
    }),
    
    onMutate: async (newData) => {
      const transactionId = createTransactionId();
      const optimistic = createOptimisticEntity(zPage, {
        ...newData,
        id: newData.id || nanoid(),
        transactions: { insert: transactionId, update: null, delete: null },
      });
      
      trackTransaction(transactionId, {
        type: 'create',
        entity: 'page',
        entityId: optimistic.id,
        status: 'pending',
      });
      
      mutateCache.create([optimistic]);
      return { transactionId, optimistic };
    },
    
    onSuccess: (_server, _vars, ctx) => {
      trackTransaction(ctx.transactionId, { status: 'sent' });
      // 'confirmed' set when Electric sync delivers entity with matching transaction
    },
    
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        trackTransaction(ctx.transactionId, { status: 'failed' });
        mutateCache.remove([ctx.optimistic]);
      }
    },
  });
};
```

---

*This document will be updated as implementation progresses.*
