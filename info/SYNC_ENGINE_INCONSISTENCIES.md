# Sync Engine - Inconsistencies & Paradoxes Review

This document identifies inconsistencies between `HYBRID_SYNC_ENGINE_PLAN.md` and `SYNC_ENGINE_REQUIREMENTS.md`, plus internal contradictions within the plan itself.

---

## 🔴 Critical Inconsistencies (Must Fix)

### 1. Column Naming: `lastTransactionId` vs `sync_transaction_id`

**Location**: Plan Part 5 (Migration Path) vs Part 2.1 (Transaction Tracking Schema)

**Contradiction**:
- Part 2.1 defines **transient** columns: `sync_transaction_id`, `sync_source_id`, `sync_changed_field`
- Part 5 (Migration Path) says: "Add `lastTransactionId` VARCHAR column"
- These are different names AND different concepts (transient vs permanent)

**Resolution needed**: Migration Path should reference the correct column names (`sync_transaction_id`, etc.) and clarify these are transient columns, not permanent audit columns.

**Affected Requirements**: DATA-001 to DATA-005

---

### 2. `changedField` Required vs Nullable in Schema

**Location**: Requirements API-004 vs Plan Section 4.3

**Contradiction**:
- Requirement API-004: "`sync.changedField` MUST be required for update mutations"
- Plan Schema (4.3): `changedField: z.string()` (required, non-nullable)
- BUT Plan TODO 3.1: "Use `changedField: null` (create = all fields)"
- AND Plan Section 2.4: "For INSERT actions, `changedField` MAY be null or '*'"

**The paradox**: Schema says `changedField` is required string, but creates/deletes should use `null`.

**Resolution needed**: Schema should be `changedField: z.string().nullable()` for creates/deletes

**Affected Requirements**: API-004, CDC-004, CDC-005

---

### 3. `sync.streamOffset` - Mentioned but Not in Schema

**Location**: Plan Section 1.2 (Upstream-First) vs Section 4.3 (Sync Wrapper Schema)

**Contradiction**:
- Section 1.2 shows diagram with `sync.streamOffset` being validated by server
- Section 4.3 defines `syncRequestSchema` - NO `streamOffset` field
- Marked as "(future)" in the diagram but then shown as working code

**Resolution needed**: remove it from the main spec.

**Affected Requirements**: None currently - but this feature is unspecified

---

### 4. `lastSourceId` Column - Referenced but Not Defined

**Location**: Plan Part 5 (Migration Path) mentions `lastSourceId` column

**Contradiction**:
- Part 5: "Add `lastSourceId` VARCHAR column"
- Part 2.1 defines `sync_source_id` as a transient column
- These are different: `lastSourceId` implies permanent, `sync_source_id` is transient

**Resolution needed**: Remove `lastSourceId` from migration path (it's the old design), keep `sync_source_id`

**Affected Requirements**: DATA-002

---

## 🟡 Minor Inconsistencies (Should Fix)

### 5. CDC Diagram References Wrong Column Name

**Location**: Plan Section 2.2 diagram

**Issue**:
```
│ Extracts transactionId from row.lastTransactionId                    │
```
Should reference `row.sync_transaction_id` (the transient column).

---

### 6. Missing `changedField` in Some API Examples

**Location**: Plan Section 2.5 (Frontend Mutation Pattern)

**Issue**: The `useAttachmentCreateMutation` example includes `sync: { transactionId, sourceId }` but no `changedField`. Per the schema, creates should include `changedField: null` or `changedField: '*'`.

---

### 7. Activities Table Index Missing `source_id`

**Location**: Requirements DATA-013 to DATA-014 vs Plan Section 2.3

**Issue**: 
- Plan Section 2.3: Shows index on `source_id`: `index('idx_activities_source_id').on(table.sourceId)`
- Requirements: Only lists indexes on `transaction_id` and composite `(entity_type, entity_id, changed_field)`

**Resolution**: Add DATA-015 for `source_id` index if needed.

---

## 🟢 Clarifications Needed (Not Contradictions)

### 8. `sync` Optional vs Required

**Location**: Plan Section 4.3

**Ambiguity**:
```typescript
export const createSyncedMutationSchema = <T>(dataSchema: T) =>
  z.object({ data: dataSchema, sync: syncRequestSchema.optional() });
```
But requirements say `sync.transactionId` MUST be required for tracked entities.

**Clarification**: The `sync` wrapper is optional for backwards compatibility during migration. Once an entity is "tracked", `sync` becomes required. This should be explicit in requirements.

---

### 9. Who Creates `transactionId` for Deletes?

**Location**: Plan Section 3.3 (TODO)

**Issue**: "Update `usePageDeleteMutation` - Use `changedField: null` for deletes"

But who generates the `transactionId` for a delete? The frontend must, but this isn't explicitly stated. Delete mutations are typically simpler (just entity ID), but sync requires transaction tracking.

**Clarification needed**: Add explicit requirement that delete mutations MUST also generate `transactionId`.

---

### 10. Offline Squashing vs Transaction ID Stability

**Location**: Requirements OFFLINE-003 vs OFFLINE-005

**Potential conflict**:
- OFFLINE-003: "Outbox entries MUST include `transactionId` (same across retries)"
- OFFLINE-005: "Same-field mutations MUST squash (keep latest value only)"

**Question**: When squashing, which `transactionId` is kept? The original (first mutation) or the latest (most recent value)?

**Clarification needed**: The LATEST `transactionId` should be kept (the one that will actually be sent), but this isn't explicit.

---

## 📋 Summary Table

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | 🔴 Critical | Column naming mismatch (lastTransactionId vs sync_transaction_id) | Update Migration Path to use correct names |
| 2 | 🔴 Critical | changedField nullable inconsistency | Make schema `z.string().nullable()` |
| 3 | 🔴 Critical | streamOffset referenced but not in schema | Add to schema or mark as future |
| 4 | 🔴 Critical | lastSourceId phantom column | Remove from migration path |
| 5 | 🟡 Minor | CDC diagram wrong column reference | Fix diagram text |
| 6 | 🟡 Minor | Missing changedField in create example | Add to example |
| 7 | 🟡 Minor | source_id index not in requirements | Add DATA-015 |
| 8 | 🟢 Clarify | sync optional vs required | Add migration note |
| 9 | 🟢 Clarify | Who creates transactionId for deletes | Add explicit requirement |
| 10 | 🟢 Clarify | Which transactionId survives squash | Specify "latest wins" |

---

## Recommended Fixes

### Fix #1: Update Migration Path (Plan Part 5)

Replace:
```markdown
1. **Add schema columns** (non-breaking)
   - Add `lastTransactionId` VARCHAR column with default `null`
   - Add `lastSourceId` VARCHAR column with default `null`
   - Add index on `lastTransactionId`
```

With:
```markdown
1. **Add transient sync columns** (non-breaking)
   - Add `sync_transaction_id` VARCHAR(32) column (nullable)
   - Add `sync_source_id` VARCHAR(64) column (nullable)
   - Add `sync_changed_field` VARCHAR(64) column (nullable)
   - No indexes needed (transient columns, not queried directly)
```

### Fix #2: Update syncRequestSchema (Plan Section 4.3)

Replace:
```typescript
changedField: z.string().describe('Which field this mutation changes'),
```

With:
```typescript
changedField: z.string().nullable().describe('Which field this mutation changes (null for create/delete)'),
```

### Fix #3: Update Requirements API-004

Replace:
```
| API-004 | `sync.changedField` MUST be required for update mutations | Backend Route | Validation rejects missing |
```

With:
```
| API-004 | `sync.changedField` MUST be a string for update mutations | Backend Route | String required for updates |
| API-004a | `sync.changedField` MUST be null for create mutations | Backend Route | Null for creates |
| API-004b | `sync.changedField` MUST be null for delete mutations | Backend Route | Null for deletes |
```

### Fix #4: Add Missing Requirement for Delete Transactions

Add to Section 5.1:
```
| FE-MUT-005 | Delete mutations MUST generate `transactionId` | Mutation Hook | Delete has transactionId |
```

### Fix #5: Clarify Squash Behavior in OFFLINE-005

Update:
```
| OFFLINE-005 | Same-field mutations MUST squash (keep latest value AND latest transactionId) | Mutation Outbox | Squashing behavior |
```

---

*Apply these fixes to both HYBRID_SYNC_ENGINE_PLAN.md and SYNC_ENGINE_REQUIREMENTS.md to ensure consistency.*
