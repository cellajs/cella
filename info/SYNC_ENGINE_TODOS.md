

## Not Yet Implemented

### 1. Hydrate Barrier (Race Prevention)

**Problem**: Stream messages arriving before initial LIST query completes can cause data regression.

**Requirement**: Queue stream messages during hydration, flush after initial queries complete.

**Location**: Should be added to `frontend/src/query/realtime/use-live-stream.ts`

**Pattern**:
```typescript
const queuedMessages = useRef<StreamMessage[]>([]);
const isHydrating = useRef(true);

// Queue during hydration
if (isHydrating.current) {
  queuedMessages.current.push(message);
  return;
}

// Flush when hydration complete
```

---

### 2. Transaction Lifecycle Tracking (pending → sent → confirmed)

**Problem**: Need to track mutation status through its lifecycle for UI feedback and confirmation via stream.

**Current state**: 
- `useSyncStore` was created but unused and removed
- No `trackTransaction()` / `useTransactionManager()` hook exists

**Options**:
1. Use React Query mutation state directly (simpler)
2. Create lightweight transaction tracker if needed for stream confirmation

**Consider**: This may not be needed if we rely on React Query's built-in mutation lifecycle + `onSuccess`/`onError` handlers.

---

---

### 3. Create + Edit Coalescing Verification

**Problem**: When entity is created offline and then edited, mutations should coalesce into single create request.

**What exists**: `coalescePendingCreate()` in `squash-utils.ts`

**What to verify**:
- Is this being used in actual mutation hooks?
- Does it handle all scenarios (create+edit+edit, create+delete)?

---