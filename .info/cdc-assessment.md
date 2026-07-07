# CDC package assessment — type strictness, duplication, separation of concerns

_Scope: `cdc/` (the PostgreSQL logical-replication worker) and its coupling to the backend "app stream". Written after the public stream was removed, leaving a single private/app stream that carries **both** product entities **and** memberships._

The central question you raised — _"app stream isn't only doing project entities, but also memberships; can we split these?"_ — is answered in [§3](#3-the-membership-question). The short version: **yes, and the cleanest split is a discriminated notification type on the same stream, not a second physical stream.** But the CDC code has deeper structural issues that make the membership coupling _feel_ worse than it is, so the rest of the report catalogs those first.

---

## 1. Mental model — what actually flows through the pipeline

The reason the code is hard to hold in your head is that **one linear pipeline serves three independent concerns**, and no file names or types make that separation explicit. Here is the real flow:

```
WAL change (pgoutput)
  → parse-message        parse tag + look up table in tableRegistry
  → handlers/*           snake→camel, compact, changed-field detection → ParseMessageResult
  → transaction-buffer   cascade suppression within a tx
  → flush-buffer         cross-tx micro-batching, group by (type, action)
  → process-events       THE JUNCTION — does three unrelated things in sequence:
        (A) persist an activities row          ← audit log
        (B) compute + apply "unified deltas"   ← counters + seq stamping
        (C) send WS payload to the backend     ← real-time sync fan-out
```

The three concerns riding this one pipe:

| Concern | Applies to | Produced where | Consumed by |
|---|---|---|---|
| **A. Activity/audit log** | every tracked table | `process-events.persistActivities` | `activities` table (catchup screening, history) |
| **B. Counters + seq** | entities + memberships (different sub-rules each) | `update-counts` + `compute/apply-unified-deltas` | `context_counters` table, entity `seq` column |
| **C. Sync notification** | product entities + memberships | `activity-service.buildActivityPayload` → WS | backend app-stream → SSE → frontend |

`ParseMessageResult` (`parse-message.ts:15`) is the single value that carries data for all three, which is why every downstream function takes the whole blob and reaches into whichever fields it cares about. That is the root cause of the "I can't form a mental model" feeling: **there is no type that says "this is a membership counter update" vs "this is a product-entity sync event."** Everything is a `ParseMessageResult` and the distinction is re-derived, ad hoc, at ~8 different branch points via `tableMeta.kind`, `tableMeta.type === 'membership'`, and `isProductEntity(...)`.

---

## 2. Separation of concerns

### 2.1 The membership vs product-entity split is smeared across ~8 branch points

Both in CDC and in the backend it feeds, the product-vs-membership distinction is a **runtime branch repeated everywhere** rather than a modeled type. Inventory:

**In CDC:**
- `update-counts.ts:46` — `tableMeta.kind === 'resource' && tableMeta.type === 'membership'`
- `update-counts.ts:56` — `... === 'inactive_membership'`
- `update-counts.ts:66` — `tableMeta.kind === 'entity'` (the entity branch)
- `compute-unified-deltas.ts:82` — `isStampable` = product entity only (seq)
- `activity-service.ts:49,115` — `isProductEntity(...)` gates cacheToken
- `process-events.ts:186` — `isProductEntity(...)` gates embedding cleanup

**In the backend it feeds** (from the stream-side audit):
- `dispatch-to-stream.ts:34` — `if (event.resourceType === 'membership')` → different permission/targeting path
- `build-message.ts:17,23,59` — nulls out `seq`/`stx`/`cacheToken` for memberships
- `app-stream-handler.ts:50` (frontend) — `if (resourceType === 'membership') { … return; }` early-return to a completely separate code path (query invalidation vs seq-range fetch)

**Membership is genuinely a different concern**, not a variant of the same one:
- Product entity notification → `seq` + `cacheToken` + entity-cache reservation + seq-range fetch on the client.
- Membership notification → no seq, no cacheToken; only counter deltas (`m:admin`, `m:total`, `m:pending`) + an org-level `s:membership` "something changed" signal; the client responds with **query invalidation**, an entirely different mechanism.

They share the transport and the `activities` row shape, and nothing else. That is the definition of an accidental coupling.

### 2.2 `process-events` is a god-function

`processEvents` (`process-events.ts:115-200`) mixes: circuit-breaker gating, tracing spans, delta computation, activity persistence with fallback, delta application, seq re-stamping, per-event logging, WS single-vs-batch dispatch, **and** embedding cleanup. The three concerns from §1 are interleaved rather than sequenced behind named steps. Even extracting three private functions — `persistAuditLog(events)`, `applyCounters(events)`, `dispatchSync(events)` — would make the file readable and make it obvious that (A) is table-agnostic while (B)/(C) branch by kind.

### 2.3 `create-activity.ts` is misfiled as a handler

It builds the `InsertActivityModel` — it is the audit-log concern's constructor, shared by all three DML handlers. It belongs in `services/` (next to `activity-service.ts`), not `handlers/`. The README even documents it under handlers, reinforcing the wrong mental model.

### 2.4 The CDC→backend wire contract is defined twice and shared nowhere

CDC builds the payload as an **untyped object literal** (`activity-service.ts:42-65`, `buildActivityPayload` has no declared return type). The backend re-declares the exact same shape as a **Zod schema** (`backend/src/lib/cdc-websocket.ts:18-50`, `cdcMessageSchema`). These two definitions of the same contract can drift silently — a field renamed in CDC won't fail to compile; it'll fail validation at runtime in production. This is both a separation-of-concerns and a type-strictness problem (see §4.1). It is the single highest-value fix in this report.

---

## 3. The membership question

> _"Is there some way we can split these either in separate streams or a separate notification type in the same stream?"_

**Recommendation: a separate notification _type_ (discriminated union) on the same stream. Do not create a second physical stream.**

Rationale:
- The physical transport (one WS connection CDC→backend, one SSE channel `org:<id>`→client) is fine and cheap. Memberships are low-volume. A second WS/SSE connection, subscriber registry, dispatcher, and frontend `StreamManager` would be a lot of moving parts to separate two concerns that a tagged union separates for free.
- The pain isn't the shared pipe — it's that the pipe carries an **untyped, mutually-exclusive-field** payload (`entityType` XOR `resourceType`, `seq`/`cacheToken` null-for-membership). Every layer re-sniffs which kind it is. A discriminant removes that.

### Proposed shape

Introduce an explicit discriminated union as the wire contract, owned in one shared place (e.g. `shared` or `sdk`), imported by CDC, backend, and frontend:

```ts
type CdcSyncNotification =
  | { kind: 'entity';     entityType: ProductEntityType; subjectId: string;
      seq: number; stx: StxBase | null; cacheToken: string | null;
      contextId: string | null; batchUntilSeq?: number; /* … */ }
  | { kind: 'membership'; resourceType: 'membership' | 'inactive_membership';
      subjectId: string; organizationId: string; contextType: ContextEntityType;
      userId: string; /* no seq / stx / cacheToken */ }
```

Then:
- CDC's `buildActivityPayload` returns `CdcSyncNotification` — the compiler enforces that memberships never carry a `cacheToken` and entities always carry a `seq`.
- Backend `handleMessage` / `build-message` switch on `.kind` instead of computing `isProduct` three times and nulling fields.
- Frontend `handleAppStreamNotification` switches on `.kind` — the existing `if (resourceType === 'membership') return` early-return becomes an exhaustive `switch` the compiler checks.
- The two duplicate contract definitions (§2.4) collapse into one: derive the Zod schema from the type (or the type from the schema) so they can't drift.

This is strictly better than today's implicit union `AppStreamProductEvent | EntityScopedEvent<… resourceType:'membership'>` (`backend/.../stream/types.ts:52`) because the discriminant is a real field the client and server both switch on, rather than "look at which of two nullable fields is populated."

**When a second stream _would_ be justified:** only if memberships needed a different delivery guarantee, retention, or fan-out topology than entity sync (e.g. memberships to an admin audit channel). They don't today. Revisit only if that changes.

Membership counter logic in CDC (`getMembershipDelta`, `getInactiveMembershipDelta` in `update-counts.ts`) is already cleanly separated at the function level — that part is fine. The split you want is at the **notification/type** layer, not the counter layer.

---

## 4. Type strictness findings

### 4.1 The wire payload is untyped end to end (highest value)
`buildActivityPayload` (`activity-service.ts:42`) and `sendBatchMessageToApi` (`:94`) return inferred anonymous objects. `wsClient.send(data: unknown)` (`websocket-client.ts:127`) erases it entirely. The only "type" for this contract is the backend Zod schema. → Give it a named shared type (see §3). Covered above; listed here because it is also the biggest _type-strictness_ win.

### 4.2 Unchecked `as Model` casts on compacted row data
`update-counts.ts:47` `newRow as MembershipModel`, `:57` `as InactiveMembershipModel`. `rowData` is a `CdcRowData` (`Record<string, unknown> & {id}`) that has been snake→camel converted **and had large columns stripped** (`compactRowData`). It is _not_ a full `MembershipModel`; the cast asserts fields that may have been compacted away. It works today only because the read fields (`role`, `contextId`, `rejectedAt`) happen to survive compaction. → Read the specific fields through a small typed accessor (`getStringValue`/a `pickMembershipFields`) instead of a whole-object cast, so the type reflects reality.

### 4.3 Dynamic context-column access forces `as Record<string, unknown>` casts
`transaction-buffer.ts:206` and `:298`, `activity-service.ts:57`, `compute-unified-deltas.ts` all read context-entity ID columns (`organizationId`, `projectId`, …) off the activity via `(activity as Record<string, unknown>)[idColumn]` because those columns are dynamic keys not surfaced on `InsertActivityModel`. → Add a typed `ContextEntityIdColumns` partial to the activity type (the backend already has one — `stream/types.ts` references `Partial<ContextEntityIdColumns>`), and reuse it in CDC. Removes ~5 casts.

### 4.4 Unnecessary casts that defeat inference
`table-registry.ts:35` `as EntityTableMeta` and `:46` `as ResourceTableMeta` — the object literals already satisfy the target types; the casts suppress checking (e.g. a missing field wouldn't error). Drop them.

### 4.5 `CdcRowData = Record<string, unknown>` is as loose as it gets
Everything downstream is `unknown`-typed field access guarded by inline `typeof` checks scattered across `get-row-value.ts`, `extract-stx-data.ts`, `update-counts.ts`, `update.ts:getStxChangedFields`. This is somewhat inherent to WAL data, but the per-entity shape is knowable from the Drizzle schema. A `CdcRow<T extends TrackedType>` mapped type keyed off `TrackedModel<T>` would let handlers narrow once and stop re-validating.

### 4.6 `getRowValue` silently narrows to `string | null`
`get-row-value.ts:7` returns only strings; non-string values become `null` with no signal. Fine for ID columns (its only current use) but the name doesn't convey the lossiness. Minor — rename to `getRowString` or document.

---

## 5. Duplication findings

### 5.1 Dead / superseded code (delete outright)
The single-event delta path is fully superseded by the batch path (the flush buffer always calls `processEvents` with an array, even for one event):
- **`computeUnifiedDeltas`** (`compute-unified-deltas.ts:91`) — production-unused; only tests call it.
- **`applyUnifiedDeltas`** (`apply-unified-deltas.ts:74`) — production-unused; only tests.
- **`applyBatchSeqOnlyDeltas`** (`apply-unified-deltas.ts:217`) — **zero** references anywhere; catchup now recalculates counters wholesale (`catchup-recovery.ts`) so this path is obsolete.
- **`extractContextId`** (`transaction-buffer.ts:295`) — exported, **zero** references.

Removing these deletes ~150 lines and, importantly, removes an entire _mirror_ of the batch logic that a reader currently has to diff against the batch version to convince themselves they behave identically. This alone will noticeably shrink the mental-model burden.

### 5.2 `isSoftDeleteTransition` defined three times, identically
`update.ts:25`, `update-counts.ts:119`, `embedding-cleanup.ts:55` — byte-for-byte the same `oldRow.deletedAt == null && newRow.deletedAt != null`. → One shared helper in `utils/`.

### 5.3 Bulk seq-stamp SQL duplicated verbatim
The `UPDATE … SET seq = v.seq, stx = t.stx - 'changedFields' FROM (VALUES …)` block is copy-pasted between `apply-unified-deltas.ts:189-199` and `:265-274` (the second copy is in the dead `applyBatchSeqOnlyDeltas`, so §5.1 removes it), and a single-row variant exists as `updateEntitySeq` (`:58`). → After deleting the dead one, extract `bulkStampSeq(byTable)` so there's one place that knows the "strip changedFields on stamp" rule.

### 5.4 Two implementations of "sum deltas into a record"
`compute-unified-deltas.ts:68` has a clean `mergeDelta(map, key, deltas)`. `apply-unified-deltas.ts:132-136` and `:155-159` re-implement the same `existing[k] = (existing[k] ?? 0) + v` merge inline against a plain object. → Share one merge util.

### 5.5 `compactRowData` and `stripExcludedColumns` are the same function, run twice
`compact-row-data.ts:36` (`compactRowData`) and `activity-service.ts:11` (`stripExcludedColumns`) have identical bodies (filter out `excludedRowDataKeys`). Worse, handlers already call `compactRowData` on the row (`insert.ts:20`, `update.ts:75`, `delete.ts:21`), and then `buildActivityPayload` calls `stripExcludedColumns` on the already-compacted row again (`activity-service.ts:64`) — a guaranteed no-op second pass. → Delete `stripExcludedColumns`; the row is already compact by the time it reaches the payload builder.

### 5.6 Context-column iteration pattern repeated ~5 times
The "loop over `appConfig.contextEntityTypes` / hierarchy ancestors, read `appConfig.entityIdColumnKeys[type]` from a row-or-activity" pattern appears in `create-activity.ts:26`, `activity-service.ts:54`, `transaction-buffer.ts:203`, `transaction-buffer.ts:296`, `compute-unified-deltas.ts:57`. → A `getContextEntityIds(source)` / `resolveParentContextId(source)` helper pair.

### 5.7 `buildActivityPayload` recomputes context IDs the activity already has
`activity-service.ts:51-60` re-derives `contextIds` by reading them back off `baseActivity` (which `createActivity` already populated at `create-activity.ts:24-33`) and re-spreading them. The comment even says "mirrors createActivity logic." It's a self-copy that does nothing the spread of `baseActivity` didn't already do. → Remove, unless there's a narrowing intent that should be documented.

### 5.8 `s:membership` bump duplicated
`update-counts.ts:51` and `:61` push the identical org-level `{ 's:membership': 1 }` signal for active and inactive memberships. Minor — fold into one post-step.

### 5.9 Two row-extraction helpers
`handle-message.ts:33` (`getMessageRow`) and `utils/extract-row-data.ts` (`extractRowData`) both pull the tuple out of a pgoutput message. Slightly different (old-vs-new selection) but consolidatable.

---

## 6. Smaller structural / correctness-adjacent notes

- **README is stale** (`cdc/README.md:46,44`): lists `services/get-error-message.ts` (that code lives in `retry.ts` as `getErrorCode`), and doesn't mention `health-reporter.ts`. `create-activity.ts` is documented as a handler but is really a builder (§2.3).
- **`getChangedFields` uses `JSON.stringify` equality** (`get-changed-fields.ts:18`) — key-order-sensitive for nested objects, so a semantically-equal JSONB reorder reads as a change. Only used on the WAL-diff fallback path (non-product entities incl. memberships), so low blast radius, but worth a comment or a stable compare.
- **`updateEntitySeq` / bulk-stamp know a domain rule** (`stx = stx - 'changedFields'`) that is _also_ enforced in `embedding-cleanup.ts:121`. That "strip changedFields so handleUpdate treats this as a non-user write" rule is load-bearing and spread across three writers with only prose comments tying them together. Consider a named `STRIP_CHANGED_FIELDS_SQL` constant or a documented invariant so a future edit doesn't break the suppression logic in `update.ts:62-69`.

---

## 7. Prioritized action list

**Tier 1 — biggest mental-model + safety win, low risk**
1. Delete dead code: `computeUnifiedDeltas`, `applyUnifiedDeltas`, `applyBatchSeqOnlyDeltas`, `extractContextId` (§5.1). Removes a whole mirrored code path.
2. Introduce the shared discriminated `CdcSyncNotification` type and make it the single wire contract; derive the backend Zod schema from it (§2.4, §3, §4.1). Switch backend + frontend on `.kind`.

**Tier 2 — dedup, mechanical, low risk**
3. Collapse `stripExcludedColumns` into `compactRowData`; remove the double-strip (§5.5).
4. Extract shared `isSoftDeleteTransition`, delta-merge, `bulkStampSeq`, and context-id helpers (§5.2–5.4, §5.6).
5. Remove the redundant context-id recompute in `buildActivityPayload` (§5.7).

**Tier 3 — type tightening**
6. Replace `as MembershipModel` / `as Record<string, unknown>` casts with typed field accessors + a shared `ContextEntityIdColumns` on the activity type (§4.2–4.4).

**Tier 4 — readability**
7. Split `processEvents` into `persistAuditLog` / `applyCounters` / `dispatchSync` (§2.2); move `create-activity.ts` to `services/` (§2.3); refresh the README (§6).

None of Tier 1–2 changes runtime behavior; they're deletions and consolidations backed by the existing tests. Tier 1.2 (the discriminated notification) is the one that directly resolves your "app stream is doing two things" discomfort — it makes the two concerns two branches of a compiler-checked union instead of an implicit convention re-sniffed at eight sites.
