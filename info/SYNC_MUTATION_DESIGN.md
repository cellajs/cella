# Sync mutation design: robustness & offline batching

> Design doc for hardening the current per-key mutation flow (Phase 1) and introducing per-entity offline batching (Phase 2).

## Context

Product entity updates currently use a **per-key** strategy: each field change is a separate mutation with its own `stx.mutationId` and `lastReadVersion`. This works well for live collaboration (minimal conflict surface), but creates issues when mutations accumulate offline: stale versions, sequential 409 cascades on reconnect, and no client-side conflict resolution.

This document defines two phases:
- **Phase 1**: Harden the current per-key flow — fix the reconciliation timing gap, add 409 handling, and ensure version freshness
- **Phase 2**: Introduce per-entity offline batching — coalesce queued per-key mutations into single requests on reconnect, add partial conflict resolution

---

## Current state audit

### What works

| Aspect | Status |
|--------|--------|
| Per-key optimistic updates | Working — `onMutate` applies instantly |
| Squash same-entity pending mutations | Working — `squashPendingMutation()` removes stale entries |
| Create + edit coalescing | Working — `coalescePendingCreate()` merges updates into pending creates |
| Mutation persistence to IndexedDB | Working — leader-only via `shouldDehydrateMutation` |
| Mutation replay after reload | Working — `addMutationRegistrar()` re-registers `mutationFn` before restore |
| Echo prevention | Working — `sourceId` comparison in SSE handler |
| Idempotency | Working — `isTransactionProcessed()` checks `mutationId` in activities |
| Field-level conflict detection (server) | Working — `checkFieldConflicts()` compares per-field versions |

### What's incomplete

| Gap | Impact | Severity |
|-----|--------|----------|
| **Reconciliation timing**: `resumePausedMutations()` fires on cache restore, before stream catchup refreshes the cache | Offline mutations replay with stale `lastReadVersion`, causing avoidable 409s | High |
| **No 409 handling on client**: `onError` shows a generic toast and rolls back — no retry, no conflict UI | Conflicting mutations are silently lost | High |
| **Version staleness in sequential replays**: Multiple paused mutations for the same entity share the pre-offline `lastReadVersion` | First succeeds (bumps version), second gets 409 because its `lastReadVersion` is now stale | High |
| **`safeFields` unused on server**: `checkFieldConflicts()` returns `safeFields` but `throwIfConflicts()` rejects the entire request | No partial-apply path exists for multi-field updates (Phase 2 prerequisite) | Medium |
| **No mutation rebase**: Doc says "client must refetch, rebase changes onto fresh data, and retry" but no rebase logic exists | Described behavior is aspirational, not implemented | Medium |

### Bugs found during scenario review

These were discovered by tracing concrete offline→reconnect scenarios through the code:

| Bug | Root cause | Fix |
|-----|-----------|-----|
| **Squash too aggressive**: `squashPendingMutation()` matches on entity ID only — editing `name` then `description` offline squashes the `name` mutation | The `_data` param (which received `{ [key]: data }`) was never used for matching | Changed signature to accept `key?: string` param; callers now pass the field key. Only mutations for the same entity AND key are squashed |
| **Catchup gate race**: `waitForActiveCatchup()` checked stream state at call time — both streams are `'disconnected'` when `onSuccess` fires (before any stream connects) | `onSuccess` fires during initial render, before route `beforeLoad` calls `connect()` | Replaced per-call state check with a module-level `initialCatchupGate` promise created at import time, resolved when any stream's first catchup completes |

---

## Phase 1: harden current per-key flow

### 1.1 Fix reconciliation timing ✅

**Problem**: `resumePausedMutations()` in `provider.tsx` `onSuccess` fires immediately after IndexedDB cache restore. The stream hasn't reconnected yet, so the cache contains pre-offline data. Each mutation's `mutationFn` calls `findPageInListCache()` to get `lastReadVersion`, but the cache entity still has the old version.

**Fix**: Gate mutation replay on stream catchup completion.

```
Current flow:
  Cache restore → resumePausedMutations() → invalidateQueries()
                  ↑ stale cache!

Fixed flow:
  Cache restore → [wait for initialCatchupGate] → stream connect → catchup
                → cache is fresh → resumePausedMutations()
```

**Implementation**:
- Module-level `initialCatchupGate` promise in `stream-store.ts`, created at import time
- Resolved by `resolveInitialCatchupGate()` on any stream's first catchup completion (or failure/disconnect)
- `provider.tsx` `onSuccess` awaits `waitForActiveCatchup()` before calling `resumePausedMutations()`
- Safe to call before any stream connects — the promise is already pending

**Key file**: [frontend/src/query/provider.tsx](../frontend/src/query/provider.tsx)

### 1.2 Handle 409 conflicts on client

**Problem**: When the server returns 409 (`field_conflict`), the client `onError` shows a generic error toast and rolls back the optimistic update. The user's change is silently lost.

#### 1.2.1 Prerequisites

**Server 409 response shape** (already implemented):
```json
{
  "type": "field_conflict",
  "status": 409,
  "meta": {
    "field": "name",
    "clientVersion": 3,
    "serverVersion": 5,
    "conflictingFields": ["name"]
  }
}
```

**Missing**: The 409 does not include the server's current *value* for the conflicting field. The client needs this to compare values and decide on a strategy. Two options:

| Approach | Pros | Cons |
|----------|------|------|
| **Include server value in 409 meta** | Single round trip | Server change needed; response schema grows |
| **Client refetches after 409** | No server change; fits existing `findPageInListCache` pattern | Extra fetch on conflict |

**Recommendation**: Client refetch. No server work, and the refetch updates the detail cache for subsequent retries. The extra round trip is acceptable since conflicts are rare.

**Also missing**: `ApiError.meta` type on the client excludes `string[]` — the `conflictingFields` array arrives at runtime but isn't typed. Fix: add `string[]` to the meta value union in [frontend/src/lib/api.ts](../frontend/src/lib/api.ts).

#### 1.2.2 Field type classification

The `createUpdateSchema` pattern accepts `z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).nullable()`. Combined with schema knowledge, fields can be classified into categories that determine resolution behavior:

| Category | Examples | Auto-resolution strategy | Rationale |
|----------|----------|------------------------|-----------|
| **boolean** | `publicAccess`, `public` | Last-write-wins (LWW) | Booleans are toggles — user intent is unambiguous |
| **enum** | `status` (`unpublished \| published \| archived`) | LWW | Discrete choice, user explicitly selected a value |
| **number** | `displayOrder` | LWW | Positional — user dragged it there |
| **reference** | `parentId` | LWW | User explicitly chose a parent |
| **short-text** | `name`, `filename` | Compare values → LWW or escalate | User chose a specific name; if different, ask |
| **long-text** | `description` (HTML content) | Always escalate | Rich content, hard to auto-merge, user intent matters most |
| **array** | `string[]` fields | Escalate (or set-union merge) | Depends on semantics |

**Key insight**: For `boolean`, `enum`, `number`, and `reference` fields, automatic LWW is safe — these are discrete values where the user's most recent intent is clear. Text fields need human judgment because two different strings can't be meaningfully auto-merged.

#### 1.2.3 Resolution strategies considered

**Strategy A: Silent LWW (auto-retry with fresh version)**

```
User sets name="A" → 409 (server has name="B") → refetch → retry with fresh lastReadVersion
```

| Pros | Cons |
|------|------|
| Zero UI, zero user friction | User's change always wins silently |
| Works for all field types | For content fields, discards another user's work without awareness |
| Simplest to implement | No visibility into what was overwritten |

**Strategy B: Value comparison + field-type-aware auto-resolve**

```
User sets name="A" → 409 → refetch → compare:
  - server.name === "A" → no-op (identical values, no conflict)
  - server.name !== "A" → check field category:
    - boolean/enum/number/ref → LWW (auto-retry)
    - short-text → toast: "Name was changed by someone else. Keep mine / Keep theirs"
    - long-text → escalate to conflict UI
```

| Pros | Cons |
|------|------|
| Catches "both users made same change" case (instant no-op) | Extra fetch for the fresh entity |
| Field-type-aware — respects content fields | Escalation path needs UI |
| Transparent | Slightly more complex |

**Strategy C: Smart merge with full escalation UI**

Extends Strategy B with a dialog for long-text fields:

```
long-text conflict → side-by-side diff view with:
  - "Keep mine" / "Keep theirs" / "Edit manually"
```

| Pros | Cons |
|------|------|
| Best UX for content-heavy apps | More complex to build |
| Extensible per entity type | Conflict state management (what if user ignores it?) |

#### 1.2.4 Recommended approach: Strategy B with escalation path to C

Implement **Strategy B** — value comparison with field-type-aware auto-resolve. For Phase 1, escalation means a toast with actions. Phase 2 can add a full conflict UI for long-text fields.

**Architecture: `ConflictResolver` utility + field category registry**

```typescript
// frontend/src/query/offline/conflict-resolver.ts

/** Field categories for conflict resolution strategy selection. */
type FieldCategory = 'boolean' | 'enum' | 'number' | 'short-text' | 'long-text' | 'array' | 'reference';

/** Resolution outcome for a single field. */
type Resolution =
  | { action: 'noop' }                                                // Values are identical
  | { action: 'retry' }                                               // Auto-retry with fresh version (LWW)
  | { action: 'escalate'; clientValue: unknown; serverValue: unknown } // Needs user decision

/** Per-entity field category config. */
const fieldCategoryRegistry = new Map<string, Record<string, FieldCategory>>();

/** Register field categories for an entity type. Called at module load time. */
export function registerFieldCategories(entityType: string, categories: Record<string, FieldCategory>) {
  fieldCategoryRegistry.set(entityType, categories);
}

/** Look up the category for a specific field. Falls back to 'short-text' (safest default — escalates). */
function getFieldCategory(entityType: string, field: string): FieldCategory {
  return fieldCategoryRegistry.get(entityType)?.[field] ?? 'short-text';
}

/** Resolve a conflict for a single field based on its category. */
function resolveField(
  category: FieldCategory,
  clientValue: unknown,
  serverValue: unknown,
): Resolution {
  // Same value → no-op regardless of type
  if (deepEqual(clientValue, serverValue)) return { action: 'noop' };

  // Auto-LWW for deterministic types
  if (['boolean', 'enum', 'number', 'reference'].includes(category)) {
    return { action: 'retry' };
  }

  // Escalate for content types (short-text, long-text, array)
  return { action: 'escalate', clientValue, serverValue };
}
```

**Entity modules register their field categories:**

```typescript
// frontend/src/modules/page/query.ts
registerFieldCategories('page', {
  name: 'short-text',
  description: 'long-text',
  status: 'enum',
  displayOrder: 'number',
  parentId: 'reference',
  keywords: 'long-text',
});

// frontend/src/modules/attachment/query.ts
registerFieldCategories('attachment', {
  name: 'short-text',
  description: 'long-text',
  filename: 'short-text',
  public: 'boolean',
  publicAccess: 'boolean',
});
```

**Integration into mutation `onError`:**

```typescript
// In usePageUpdateMutation onError:
onError: async (error, variables, context) => {
  // Roll back optimistic update
  if (context?.previousPage) { /* restore cache */ }

  // Handle conflict
  if (error instanceof ApiError && error.status === 409 && error.type === 'field_conflict') {
    const resolution = await resolveConflict({
      entityType: 'page',
      entityId: variables.id,
      field: variables.key,
      clientValue: variables.data,
      refetch: () => queryClient.fetchQuery({ queryKey: keys.detail.byId(variables.id), staleTime: 0 }),
    });

    switch (resolution.action) {
      case 'noop':
        // Values are identical — re-apply optimistic update, no retry needed
        break;
      case 'retry':
        // Re-mutate with fresh version (mutationFn reads cache, which refetch just updated)
        mutate({ id: variables.id, key: variables.key, data: variables.data });
        break;
      case 'escalate':
        // Show toast: "[Field] was changed by someone else"
        showConflictToast(variables.key, resolution.clientValue, resolution.serverValue, {
          onKeepMine: () => mutate({ id: variables.id, key: variables.key, data: variables.data }),
          onKeepTheirs: () => { /* no-op, cache already has server value from refetch */ },
        });
        break;
    }
    return; // Don't show generic error toast
  }

  handleError('update');
},
```

#### 1.2.5 Escalation UI options

**Phase 1: Toast with actions** (minimal, fits existing patterns)

For `short-text` conflicts, show a toast via the existing `toaster()` utility:

```
"Name" was changed by someone else.
[Keep mine] [Keep theirs]
```

This is non-blocking — the user can ignore it (server value stays). The optimistic update was already rolled back, so the UI shows the server state by default.

**Phase 2: Conflict dialog for long-text** (future)

For `description` and other rich content fields, a side-by-side dialog:

```
┌─ Conflict: Description ────────────────────┐
│                                              │
│  Your version:          Their version:       │
│  ┌──────────────┐      ┌──────────────┐     │
│  │ Lorem ipsum  │      │ Dolor sit    │     │
│  │ dolor sit... │      │ amet cons... │     │
│  └──────────────┘      └──────────────┘     │
│                                              │
│  [Keep mine]  [Keep theirs]  [Edit manually] │
└──────────────────────────────────────────────┘
```

This is deferred to Phase 2 because it requires a new UI component and state management for pending conflicts.

#### 1.2.6 Edge cases

| Case | Behavior |
|------|----------|
| 409 during offline replay (sequential) | Handled: scope serialization ensures one-at-a-time. On 409, resolve, then next mutation picks up fresh version. |
| 409 on retry (rapid concurrent edits) | Cap retries at 1. If the retry also 409s, escalate regardless of field type. |
| User closes toast without choosing | Server value stays (optimistic was already rolled back). No data loss — user can re-edit. |
| Multiple fields conflict simultaneously | Only relevant for Phase 2 batch endpoint. Per-key mutations have exactly one field. |
| Network error during refetch after 409 | Fall back to generic error toast. The original 409 is unrecoverable without fresh data. |
| Field not registered in category registry | Falls back to `'short-text'` (escalate). Safe default — never silently overwrites unclassified fields. |

#### 1.2.7 Implementation steps

| Step | Task | Scope |
|------|------|-------|
| 1.2a | Fix `ApiError.meta` type — add `string[]` to value union | Tiny ([api.ts](../frontend/src/lib/api.ts)) |
| 1.2b | Create `conflict-resolver.ts` — field category registry + `resolveField()` | Small (new file in `query/offline/`) |
| 1.2c | Create `resolveConflict()` — orchestrates refetch → compare → resolve | Small (same file) |
| 1.2d | Register field categories in page + attachment query modules | Tiny (2 calls) |
| 1.2e | Wire into page `onError` — detect 409, call resolver, handle outcome | Medium ([page/query.ts](../frontend/src/modules/page/query.ts)) |
| 1.2f | Wire into attachment `onError` — same pattern | Small ([attachment/query.ts](../frontend/src/modules/attachment/query.ts)) |
| 1.2g | Toast-based escalation UI — conflict toast with Keep mine / Keep theirs | Small (extend toaster) |
| 1.2h | Tests — unit tests for resolver, integration test for 409 flow | Medium |

### 1.3 Fix version staleness in sequential replays ✅

**Problem**: When multiple paused mutations for the same entity resume, they all carry the same `lastReadVersion` from before going offline. The first succeeds and bumps the server version. The second now has a stale `lastReadVersion` and gets 409'd — even though both are from the same user with no actual conflict.

**Root cause**: The mutation default's `mutationFn` reads `lastReadVersion` from cache at execution time (`findPageInListCache(id)` → `createStxForUpdate(cachedEntity)`). But the first mutation's `onSuccess` updates the cache with the new `stx`, so the second mutation *should* pick up the fresh version — **if** it executes after the first's `onSuccess` completes.

**Current protection**: `scope: { id: 'page' }` serializes mutations within the same scope. This means mutation 2 waits for mutation 1 to fully complete (including `onSuccess`). So in theory, the version should be fresh.

**Verified**: Test confirms that `scope` serialization gates on `onSuccess` completion (not just `mutationFn`). The second mutation reads the version bumped by the first's `onSuccess`. Control test without scope confirms concurrent execution sees stale versions.

**Test**: [frontend/src/query/offline/scope-serialization.test.ts](../frontend/src/query/offline/scope-serialization.test.ts)

### 1.4 Add retry budget for paused mutations

**Problem**: If the server is temporarily unavailable or rate-limiting on reconnect, all paused mutations fail simultaneously.

**Fix**: Configure `retry` on mutation defaults with a backoff strategy:

```typescript
queryClient.setMutationDefaults(keys.update, {
  retry: 2,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  mutationFn: async ({ id, key, data }: UpdatePageVars) => { /* ... */ },
});
```

This gives transient failures a chance to recover without user intervention.

---

## Phase 2: per-entity offline batching

### 2.1 Strategy overview

Keep per-key mutations when online (fine-grained, low-latency). When replaying offline mutations, **coalesce per-key mutations into per-entity batches** before sending.

This is **not** a runtime mode switch. It's a replay-time optimization:

```
Online: user edits name → API call {key:'name', data:'New'}        (per-key, immediate)
Online: user edits desc → API call {key:'description', data:'...'}  (per-key, immediate)

Offline: user edits name → queued {key:'name', data:'New'}
Offline: user edits desc → queued {key:'description', data:'...'}
Reconnect: coalesce → API call {updates:{name:'New', description:'...'}, stx}  (per-entity, batched)
```

### 2.2 Backend: batch update endpoint

Add a new endpoint (or extend existing) that accepts multiple field updates:

```
PATCH /page/:tenantId/:id/batch
Body: { updates: Record<string, unknown>, stx: StxRequest }
```

**Server logic**:
1. Extract `changedFields` from `Object.keys(updates)`
2. Call `checkFieldConflicts(changedFields, entity.stx, stx.lastReadVersion)`
3. **New**: use `safeFields` for partial application (see 2.4)
4. Apply all safe updates in a single `SET` + single version bump
5. Return updated entity + conflict report (if any fields rejected)

**Schema** (zod-openapi):
```typescript
const batchUpdateBody = z.object({
  updates: z.record(z.string(), z.unknown()),
  stx: stxRequestSchema,
});
```

### 2.3 Frontend: replay-time coalescing

Add a coalescing step between cache restore and `resumePausedMutations()`:

```
Cache restore → catchup complete (from 1.1) → coalescePausedMutations() → replay
```

**`coalescePausedMutations()` logic**:
1. Scan mutation cache for all pending mutations
2. Group by entity ID (across mutation keys like `['page', 'update']`)
3. For each entity with multiple pending per-key mutations:
   - Merge into single `{ updates: {field1: val1, field2: val2}, stx }` with fresh `lastReadVersion`
   - Remove the individual mutations from cache
   - Insert a single batch mutation
4. Single-mutation entities pass through unchanged (use existing per-key endpoint)

**Threshold**: Only coalesce when there are 2+ pending mutations for the same entity. A single pending mutation uses the existing per-key endpoint — no new code path needed.

### 2.4 Partial conflict resolution

**Current limitation**: `throwIfConflicts()` rejects the entire request if any field conflicts. The `safeFields` return value from `checkFieldConflicts()` is unused.

**Fix for batch updates**: Return a mixed response:

```typescript
// Server response for batch update with partial conflicts
{
  applied: { name: 'New Title' },           // Fields successfully updated
  conflicts: [{
    field: 'description',
    clientValue: 'User wrote this',
    serverValue: 'Someone else wrote this',
    serverVersion: 5,
  }],
  entity: { /* updated entity with applied fields */ },
}
```

**Client handling**:
1. **All fields applied**: done, update cache
2. **Some fields conflicting**: 
   - Apply safe fields (already done server-side)
   - For conflicting fields: queue for resolution
   - Show inline conflict UI with three options:
     - **Keep mine**: retry the conflicting field(s) with fresh `lastReadVersion` (force overwrite)
     - **Keep theirs**: discard local change, accept server value
     - **Manual merge**: show both values, let user edit
3. **All fields conflicting**: same as current 409, but with field-level detail

### 2.5 Conflict resolution placement

> "The first-fetch-then-push pattern makes it attractive to focus conflict resolution on the client."

This is the right call. After catchup, the client has:
- The fresh server state (from catchup fetch)
- The user's intended changes (from mutation queue)
- The ability to present UI for manual resolution

The server's role is to **detect and reject**, not resolve. It returns enough metadata (conflicting field names, server values, versions) for the client to make decisions. This keeps server logic simple and puts resolution where context exists — in front of the user.

**Server contract**:
- Per-key endpoint: 409 with field metadata (current behavior, keep as-is)
- Batch endpoint: 207-style mixed response (applied + conflicts)

**Client contract**:
- Auto-resolve: identical values, last-write-wins for non-critical fields
- Manual resolve: show UI for user-facing content fields (name, description, rich text)
- Resolution results in fresh mutations with current `lastReadVersion`

---

## Implementation order

### Phase 1 (harden current flow)

| Step | Task | Files | Depends on |
|------|------|-------|------------|
| 1.1 ✅ | Gate `resumePausedMutations` on catchup completion | `provider.tsx`, `stream-store.ts` | — |
| 1.2a | Fix `ApiError.meta` type (add `string[]`) | `api.ts` | — |
| 1.2b | Create `conflict-resolver.ts` — registry + `resolveField()` | New `query/offline/conflict-resolver.ts` | — |
| 1.2c | Create `resolveConflict()` orchestrator | Same file | 1.2b |
| 1.2d | Register field categories in page + attachment | `page/query.ts`, `attachment/query.ts` | 1.2b |
| 1.2e | Wire 409 handling into page `onError` | `page/query.ts` | 1.2c, 1.2d |
| 1.2f | Wire 409 handling into attachment `onError` | `attachment/query.ts` | 1.2c, 1.2d |
| 1.2g | Toast-based escalation UI | Extend toaster | 1.2e |
| 1.2h | Tests — resolver unit + 409 integration | `query/offline/` | 1.2c |
| 1.3 ✅ | Verify `scope` serialization gates on `onSuccess` | Test written | — |
| 1.4 | Add retry budget to mutation defaults | `page/query.ts`, mutation registry | — |
| 1.5 | Test: offline → reconnect → sequential replay | Integration test | 1.1 |

### Phase 2 (offline batching)

| Step | Task | Files | Depends on |
|------|------|-------|------------|
| 2.1 | Backend batch update endpoint | `page-routes.ts`, `page-handlers.ts` | — |
| 2.2 | Use `safeFields` for partial apply in batch handler | `field-versions.ts`, `page-handlers.ts` | 2.1 |
| 2.3 | Replay-time coalescing utility | New `coalesce-replay.ts` in `query/offline/` | Phase 1 |
| 2.4 | Wire coalescing into reconnect flow | `provider.tsx` | 2.3, 1.1 |
| 2.5 | Conflict resolution UI component | New component in `modules/common/` | 2.2 |
| 2.6 | Client conflict handler for batch responses | `page/query.ts`, new util | 2.5 |

---

## Design decisions

### Why not switch mutation strategy at runtime?

Dynamically flipping between per-key (online) and per-entity (offline) adds:
- Mode detection complexity (what if connection is flaky?)
- Two code paths in every mutation hook
- Edge cases when transitioning mid-mutation

Instead, **always create per-key mutations** and **coalesce at replay time**. This means:
- One mutation creation path (per-key), no branching
- Coalescing is a queue optimization, not a strategy change
- Works regardless of connection flakiness — coalescing only happens on replay

### Why client-side conflict resolution?

| Approach | Pros | Cons |
|----------|------|------|
| **Server resolves** | Simpler client | Server can't know user intent; needs CRDT or policy engine |
| **Client resolves** | Has user intent + ability to show UI | More client complexity |
| **Both** | Maximum flexibility | Duplication risk |

The "first fetch then push" pattern naturally positions the client as the resolver. The server provides detection + metadata; the client has the merge context (user's changes vs server state) and can present choices when needed.

### Why not CRDTs?

CRDTs (Conflict-free Replicated Data Types) resolve conflicts automatically but:
- Require fundamental data model changes
- Add complexity to every field type
- "Automatic resolution" may not match user intent for content fields
- Overkill for Cella's use case (collaborative but not Google-Docs-level concurrent editing)

Per-field version tracking with user-facing resolution is simpler and more predictable.

---

## Appendix: `safeFields` gap detail

`checkFieldConflicts()` in [field-versions.ts](../backend/src/sync/field-versions.ts) returns both arrays:

```typescript
interface ConflictCheckResult {
  conflicts: FieldConflict[];   // Fields where serverVersion > lastReadVersion
  safeFields: string[];          // Fields where serverVersion <= lastReadVersion
}
```

But `throwIfConflicts()` only checks `conflicts.length > 0` and throws for the entire request. The `safeFields` array is never read by any caller.

**Current impact**: None — per-key mutations always send a single field, so it's all-or-nothing by definition.

**Phase 2 impact**: Batch updates will send multiple fields. Without using `safeFields`, a conflict on one field rejects all fields — even uncontested ones. The fix is to apply `safeFields` and return a partial success response for the batch endpoint.
