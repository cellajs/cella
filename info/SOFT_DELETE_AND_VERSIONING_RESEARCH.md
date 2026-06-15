# Soft delete & field-level versioning research

Status: research / proposal (no code changes yet)
Scope: all product entities (soft delete) + rich-text field versioning (BlockNote / Yjs `description`)
Author context: exploratory design doc for Cella core, with Raak as the reference consumer.

This document maps the current architecture, surveys best-practice patterns from comparable open-source stacks, evaluates the "store rich-text versions in Scaleway S3 with versioning enabled" idea, and proposes a phased, opinionated plan.

---

## 1. Goals & non-goals

**Goals**
- **Soft delete** for every product entity (`attachment`, `page`, and fork entities), so deletes are recoverable and auditable — "trust in the system."
- **Field-level versioning**, focused first (and maybe only) on rich-text fields edited with BlockNote (`description`), with the ability to view and restore prior versions.
- Keep Postgres lean: the sync engine already makes Postgres do a lot (WAL → CDC → SSE, `context_counters`, RLS, immutability triggers). Versioning payloads should not bloat the hot tables.

**Non-goals (for now)**
- Full document-level versioning of context entities (organizations, etc.).
- Versioning of scalar/set fields (`name`, `status`, `labels`). These already converge silently via HLC/AWSet; an audit trail for them is a separate, smaller concern (see §6.4).
- Replacing the existing sync/merge model. Versioning sits *beside* it.

---

## 2. Current architecture (what we're building on)

### 2.1 Product entity shape — no deletion marker today

`productEntityColumns()` ([backend/src/db/utils/product-entity-columns.ts](../backend/src/db/utils/product-entity-columns.ts)) composes:

- identity/tenant columns (`id`, `entityType`, `tenantId`, `createdAt`, `updatedAt`, `name`)
- `description` (`varchar(maxLength.html)`, the materialized rich text), `keywords`
- `createdBy`, `updatedBy` (FK → `users.id`, `onDelete: 'set null'`)
- `seq` (`bigint`, stamped by CDC)
- `stx` (jsonb sync-transaction metadata)

There is **no `deletedAt` / `isDeleted` / `archivedAt`** anywhere in the repo. Every delete is a hard `DELETE`:

- Pages: `deletePagesByIds` → `db.delete(pagesTable)` ([backend/src/modules/page/page-queries.ts](../backend/src/modules/page/page-queries.ts))
- Attachments: `deleteAttachmentsByIds` → `db.delete(attachmentsTable)` ([backend/src/modules/attachment/attachment-queries.ts](../backend/src/modules/attachment/attachment-queries.ts))

### 2.2 Sync engine touchpoints a deletion flows through

The pipeline is **Postgres WAL → CDC worker → ActivityBus → SSE → client** (see [ARCHITECTURE.md](./ARCHITECTURE.md) and [SYNC_ENGINE.md](./SYNC_ENGINE.md)). For a delete today:

1. A row `DELETE` produces a WAL event.
2. CDC `computeUnifiedDeltas` ([cdc/src/utils/compute-unified-deltas.ts](../cdc/src/utils/compute-unified-deltas.ts)) computes count deltas (decrement `context_counters`) — deletes are **not** seq-stamped (`isStampable` is create/update only).
3. `applyUnifiedDeltas` ([cdc/src/utils/apply-unified-deltas.ts](../cdc/src/utils/apply-unified-deltas.ts)) updates `context_counters`.
4. An SSE `delete` notification is emitted; the client patches deletes directly into detail + list caches during **Phase A catchup** (no refetch).
5. The client's **count-based integrity check** compares server entity counts vs cached totals.

> This matters a lot: switching to soft delete turns a `DELETE` into an `UPDATE`. CDC must be taught that "an `UPDATE` that sets `deleted_at` from NULL → timestamp" is semantically a **delete** for the client (remove from list caches + decrement counts), while a NULL → timestamp **restore** is a create/re-add.

### 2.3 Rich text today: ephemeral Yjs, durable materialized string

The rich-text (`description`) field uses the **YATA** strategy (Yjs CRDT) per [ARCHITECTURE.md §per-field merge strategies](./ARCHITECTURE.md#per-field-merge-strategies):

- BlockNote editor ([frontend/.../blocknote/block-note-editor.tsx](../frontend/src/modules/common/blocknote/block-note-editor.tsx)) connects via `y-websocket` to the standalone **Yjs worker** (`yjs/`).
- The Yjs worker stores the binary doc state in `yjs_documents` (`state bytea`, PK `(entity_type, entity_id)`) — see `yjs/src/data/storage.ts`. This row is **ephemeral**: created on first WS connect, debounce-saved during editing, and **deleted after a ~5-minute grace period** once everyone disconnects.
- On blur/commit, the client pushes the rendered description through a normal React Query mutation (`sendDerivedUpdate`), which writes the **`description` varchar** on the entity row. That column is the durable source of truth; Yjs is just the live transport + merge layer.

**Implication for versioning:** the natural, durable thing to version is the **materialized `description` blob** (a BlockNote JSON string), captured at commit time. Yjs snapshots are an *optional* richer layer (character-level attribution / blame) but are not currently persisted at all.

### 2.4 Object storage today (Scaleway, S3-compatible)

- S3 client targets Scaleway (`endpoint: https://${appConfig.s3.host}`, region `nl-ams`) — [backend/src/modules/attachment/helpers/signed-url.ts](../backend/src/modules/attachment/helpers/signed-url.ts).
- Uploads go through Transloadit `/s3/store` into a public or private bucket with key `/{tenantId}/{file.id}.{file.url_name}` — [backend/src/lib/transloadit.ts](../backend/src/lib/transloadit.ts).
- **No bucket versioning is configured.** Attachment rows hold single `originalKey` / `convertedKey` / `thumbnailKey` strings.

Confirmed capabilities (Scaleway docs): Object Storage is S3-compatible and supports **bucket Versioning** (multiple variants per key, list/restore/delete-by-version-id), **Lifecycle** rules (expiration + storage-class transition, incl. by prefix and noncurrent versions), **Object Lock / retention / legal hold** (WORM). All reachable with the existing `@aws-sdk/client-s3`.

---

## 3. Part A — Soft delete for product entities

### 3.1 Column design

Add to `productEntityColumns()` so every product entity inherits it uniformly:

```ts
deletedAt: timestamp('deleted_at', { mode: 'string' }), // nullable; null = live
deletedBy: uuid('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
```

Keep it on the **product entity** mixin only. Context entities (organizations) are not synced the same way and have different deletion semantics (cascading membership teardown); treat them separately and out of scope here.

### 3.2 The hard problems (this is "invasive" — here's why)

1. **Every read must exclude soft-deleted rows by default.** Drizzle has no global query scope. Options, best-to-worst for this codebase:
   - **RLS-level filter (recommended):** extend `tenantSelectPolicy()` ([backend/src/db/rls-helpers.ts](../backend/src/db/rls-helpers.ts)) so the SELECT policy adds `AND deleted_at IS NULL`. Because product-entity reads already go through `tenantRead()` ([backend/src/db/tenant-context.ts](../backend/src/db/tenant-context.ts)), every normal read is filtered at the database boundary — fail-closed, consistent, impossible to forget in a handler. Add a dedicated escape hatch (a separate transaction/role flag, or a `tenantReadWithDeleted()` helper that sets a session var like `app.include_deleted = true`) for restore/trash views and the purge job.
   - **Query helper:** a `notDeleted(table)` predicate every query must remember to include. Simple but easy to forget — exactly the bug class RLS is meant to catch.
   - **Postgres views** (`pages_live`): clean but doubles the surface and fights Drizzle's typing.

2. **Unique constraints must ignore deleted rows.** Example: `pages` has `unique('pages_group_order').on(parentId, displayOrder)` ([backend/src/modules/page/page-db.ts](../backend/src/modules/page/page-db.ts)). After soft delete, a deleted page still occupies its `(parentId, displayOrder)` slot and blocks reuse. Convert affected uniques to **partial unique indexes**:
   ```sql
   CREATE UNIQUE INDEX pages_group_order ON pages (parent_id, display_order) WHERE deleted_at IS NULL;
   ```
   Audit every `unique(...)` on product tables for this.

3. **Foreign keys / cascades don't soft-cascade.** A hard `ON DELETE CASCADE` won't run when you only set `deleted_at`. Parent→child soft-delete must be done in application logic (mark children deleted in the same transaction) or via a recursive trigger. For Cella, do it explicitly in the operation layer (e.g. soft-deleting a `page` with child pages). Self-referential `pages.parentId` is the immediate case.

4. **Immutability triggers.** Identity columns are protected by BEFORE UPDATE triggers ([backend/src/db/immutability-triggers.ts](../backend/src/db/immutability-triggers.ts)). `deleted_at` / `deleted_by` are new mutable columns — make sure the triggers don't reject the soft-delete UPDATE, and conversely that `deleted_by` itself becomes immutable-once-set if you want audit integrity.

### 3.3 Sync-engine integration (the part that makes it actually work)

This is the highest-risk integration and the reason soft delete is "invasive":

- **CDC delete detection.** Teach the WAL parser/`computeUnifiedDeltas` to treat an `UPDATE` where `deleted_at` transitions `NULL → not null` as a **logical delete**: emit the same `delete` activity + count decrement that a physical `DELETE` produces today. The reverse transition (`not null → NULL`) is a **restore** → treat like a create (count increment + list re-add). A normal field `UPDATE` on an already-deleted row should emit nothing client-facing.
- **Seq stamping.** A logical delete should bump `seq` (unlike today's physical delete, which isn't stamped) so the change rides the normal catchup/`seqCursor` delta path and offline clients converge. This is arguably *cleaner* than today's model, where physical deletes rely solely on the count-integrity check.
- **List endpoints.** `seqCursor` delta fetches must include rows whose only change is `deleted_at` so clients learn about deletions; but the default list filter must still hide them. Net: the catchup query needs a "give me changes since seq X *including* tombstones" mode distinct from the normal "live rows only" list.
- **Count integrity.** `context_counters` entity counts must decrement on logical delete and increment on restore, so the client's integrity check stays correct.

### 3.4 Restore, trash UI, and purge

- **Restore:** clear `deleted_at`/`deleted_by` (subject to unique-slot availability — restoring a page whose `(parentId, displayOrder)` was reclaimed needs a reorder/relocate step).
- **Trash view:** a dedicated read path using the "include deleted" escape hatch, filtered to `deleted_at IS NOT NULL`, scoped by permission.
- **Hard purge (retention):** a scheduled job hard-`DELETE`s rows older than a retention window (e.g. 30 days). This is where attachments must also delete their S3 objects, and rich-text versions get their lifecycle/expiry. Keep purge in `admin_role` (BYPASSRLS) so it can see deleted rows. The physical `DELETE` then flows through the existing CDC path normally.

### 3.5 Permissions

Add `restore` (and maybe `viewTrash` / `purge`) actions to the access policy layer (`configureAccessPolicies`, [shared/config/permissions-config.ts](../shared/config/permissions-config.ts)). Restore should generally require the same or stronger permission than delete; purge should be admin-only.

### 3.6 Migration notes

- Additive columns (`deleted_at`, `deleted_by`) — safe, backfilled as NULL.
- Replacing `unique(...)` with partial unique indexes is a real migration; generate via `pnpm generate` and review the SQL.
- RLS policy change to add `deleted_at IS NULL` — review `backend/tests/security/cross-org.test.ts` and add soft-delete visibility tests.

---

## 4. Part B — Rich-text (BlockNote/Yjs) field versioning

### 4.1 What BlockNote / Yjs actually offer

- **BlockNote has no built-in version-history store.** Versioning in the BlockNote/Tiptap/Yjs ecosystem is provided either by hosted backends (Liveblocks, Velt, y-sweet — all advertise "version history") or built DIY on Yjs primitives. BlockNote *does* ship `@blocknote/core/yjs` utilities (`blocksToYDoc`, `yDocToBlocks`, `blocksToYXmlFragment`, `yXmlFragmentToBlocks`) for converting between blocks and a Y.Doc **without a live editor** — useful for server-side snapshot rendering. Note the explicit warning: `blocksToYDoc` must **not** be used to rehydrate an existing collaborative doc (it destroys history).
- **Yjs has first-class snapshot support.** The canonical mechanism:
  - Set `doc.gc = false` (disable garbage collection) so deleted content is retained and old states are restorable.
  - `Y.snapshot(doc)` / `Y.encodeSnapshot(snapshot)` captures a lightweight **state vector + delete set** (a pointer into history, *not* a full copy).
  - `Y.createDocFromSnapshot(doc, snapshot)` reconstructs the document as of that snapshot — this is how diff/blame/restore views are built.
  - For full durable state, `Y.encodeStateAsUpdate(doc)` produces a complete binary update; updates are commutative/idempotent and can be `Y.mergeUpdates([...])`-compacted.
  - The **Tiptap "snapshot/version history" extension** is the reference DIY implementation for this exact stack: it stores an array of named/auto snapshots *inside the Y.Doc* and renders any version via `createDocFromSnapshot`.

The tradeoff: `gc = false` makes documents grow monotonically. That's fine for bounded editing sessions but means long-lived heavily-edited docs need periodic compaction (snapshot to a new doc, restart history).

### 4.2 Three viable versioning models for Cella

#### Model 1 — Materialized-string revisions (simplest, "good enough" trust)

At each durable commit (the existing `sendDerivedUpdate` write of `description`), also persist a **revision record**: `{entityType, entityId, seq, createdBy, createdAt, content}` where `content` is the BlockNote JSON string. Versions are coarse (one per commit/blur, not per keystroke), but that's usually what users want for "history" and "restore."

- **Pros:** trivial to reason about; no Yjs lifecycle changes; restore = write the old string back through the normal mutation path (so it re-syncs cleanly); works for *any* rich-text-bearing field, and even non-rich fields if desired.
- **Cons:** no character-level attribution/blame; storing many full copies is wasteful if done in Postgres (→ this is where object storage shines, §5).

#### Model 2 — Yjs snapshot history (richest, true blame/diff)

Persist Yjs `encodeSnapshot` blobs (+ a base `encodeStateAsUpdate`) so any historical state is reconstructable with `createDocFromSnapshot`. Requires running the Yjs worker docs with `gc = false` and a compaction strategy. Closest to Google-Docs-style history.

- **Pros:** character-level diff, per-author attribution, named checkpoints.
- **Cons:** requires changing the Yjs worker's lifecycle (today docs are ephemeral and GC'd); doc growth/compaction management; snapshots are only meaningful relative to retained history.

#### Model 3 — Append-only Yjs update log + periodic snapshot (AFFiNE / Huly pattern)

Persist every Yjs `update` (append-only) and periodically compact into a snapshot; reconstruct any point in time by replaying updates up to a seq/clock. This is what large Yjs apps (AFFiNE, Huly) and providers (y-postgresql, y-redis, Hocuspocus) do for durability *and* history.

- **Pros:** durable real-time persistence **and** history in one mechanism; survives crashes; no ephemeral-doc data loss.
- **Cons:** biggest change — replaces the current ephemeral `yjs_documents` model with a real persistence provider; more moving parts (compaction, replay).

### 4.3 Recommendation for rich text

Adopt a **layered** approach, lead with Model 1, leave room for Model 2:

1. **Phase 1 — materialized revisions (Model 1), stored in object storage (§5).** Capture one version per durable `description` commit. This delivers visible, restorable history quickly, with zero changes to the Yjs worker's hot path, and directly satisfies the "trust" goal. Restore goes through the normal mutation → sync path, so no special client logic.
2. **Phase 2 (optional) — Yjs snapshots (Model 2)** for fields/entities that need true blame/diff, by extending the Yjs worker to persist `encodeSnapshot` at commit boundaries (with `gc = false` + compaction). Only do this if users actually need character-level history; it's materially more complex.
3. **Do not jump straight to Model 3** unless you also want to solve durable real-time persistence (i.e. stop losing in-flight edits when the worker GC's the doc). That's a valuable but separate initiative — flag it, don't bundle it.

---

## 5. The Scaleway S3-versioning idea — evaluation

> Idea: store rich-text versions as objects in a Scaleway S3 bucket with **bucket versioning enabled**, instead of burdening Postgres.

This is a **sound instinct** and aligns with how large systems (Notion, Dropbox Paper, many CMSs) offload large/immutable revision payloads to object storage. Two distinct ways to use it:

### 5.1 Option A — rely on **native S3 object versioning** (one key per entity)

Key per field, e.g. `versions/{tenantId}/{entityType}/{entityId}/description.json`. Every commit `PutObject`s the same key; S3 keeps each prior write as a **noncurrent version** with its own `versionId`.

- **Pros:** zero version-bookkeeping in your code; `ListObjectVersions` gives the history; `GetObject?versionId=…` fetches any prior state; lifecycle rules can auto-expire noncurrent versions (e.g. keep 90 days) — Scaleway supports noncurrent-version expiration. Object Lock can enforce WORM/legal-hold if compliance ever matters.
- **Cons:**
  - **Metadata still lives somewhere.** To show "edited by X at seq N" you need author/seq/timestamp per version. S3 user-metadata on each version can hold this, but querying/listing "all versions with authors" means `ListObjectVersions` + per-object head — no relational queries, no joins to `users`. You'll likely still want a thin Postgres index table (see Option B) for UX.
  - **No transactional consistency with Postgres.** The `PutObject` and the entity-row write can't be in one transaction; you need an idempotent, retryable write (e.g. write S3 first, then record pointer; tolerate orphans via the purge job).
  - **Restore semantics** require a `CopyObject` (version → current) *and* writing the restored content back into `description` so the sync engine and clients converge — S3 versioning alone doesn't touch Postgres or notify clients.
  - **Per-tenant isolation** is by key prefix, not by RLS — weaker boundary than the DB. Use prefix-scoped bucket policies and never expose raw keys.
  - Listing/!diffing across versions is slower (network round-trips) than a single indexed SQL query.

### 5.2 Option B — **Postgres pointer table + immutable objects** (recommended)

Keep a small relational index and store the heavy payload in object storage as **immutable, content-addressed objects** (don't even need bucket versioning):

```
rich_text_versions (
  id, entity_type, entity_id, tenant_id,
  seq,                 -- ties version to the sync timeline
  created_by, created_at,
  storage_key,         -- e.g. versions/{tenant}/{type}/{id}/{seq}.json  (immutable, unique per version)
  byte_size, content_hash,
  label                -- optional, for named checkpoints
)
```

- **Pros:** relational queries/joins for the history UI (author names, ordering by `seq`), clean per-tenant scoping (can reuse `tenantId` + RLS), Postgres stores only tiny rows (pointers), heavy JSON lives in cheap object storage. Content-hash dedup avoids storing identical consecutive versions. Restore is a normal flow: fetch object → write back through the mutation → sync. Lifecycle/expiry handled by `storage_key` prefix rules and/or the existing purge job deleting both the row and the object.
- **Cons:** you manage version identity yourself (but that's just the `seq`/`id` you already have); slightly more code than "just turn on bucket versioning."
- **Bucket versioning becomes optional** here — used only as a safety net against accidental overwrite of supposedly-immutable objects. Since each version has a **unique immutable key**, you don't *need* S3 versioning for the feature itself.

### 5.3 Verdict

- **Use object storage for the payloads — yes.** It keeps Postgres lean (exactly the stated concern) and matches the codebase's existing Scaleway integration.
- **Prefer Option B (pointer table + immutable keys)** over relying on native bucket versioning as the primary mechanism. You almost always need the relational index for a usable history UI, per-tenant isolation, and clean restore-through-sync. Native bucket versioning is a nice **defense-in-depth** addition (enable it on the versions bucket + noncurrent-version lifecycle expiry), not the system of record.
- For Yjs snapshots (Phase 2), the same Option-B shape applies: small Postgres pointer rows, binary snapshot blobs in object storage.

---

## 6. How comparable open-source stacks do this

| System | Stack | Soft delete | Rich-text / doc versioning |
|---|---|---|---|
| **Tiptap Pro** (history/snapshot ext.) | Yjs + ProseMirror | n/a | Yjs snapshots stored in the Y.Doc; `createDocFromSnapshot` to view/restore — closest reference for Cella's stack |
| **AFFiNE** | Yjs (y-octo) + custom | yes | Append-only Yjs update log + periodic snapshots (Model 3) |
| **Huly** | Yjs + Postgres/Mongo | yes | Yjs persistence + snapshots |
| **Hocuspocus / y-postgresql / y-redis** | Yjs providers | n/a | Durable update log + snapshot compaction (Model 3 building blocks) |
| **Ghost / WordPress** | MySQL | trash + scheduled purge | Per-revision rows (Model 1, full copies in DB) |
| **Notion / Dropbox Paper** | block store + object storage | yes (trash) | Periodic snapshots + edit ops; large payloads in object storage |
| **Linear** | sync engine | yes | Document history via sync-engine deltas |

**Patterns that recur (and that fit Cella):**
- Soft delete = `deleted_at` nullable + **partial unique indexes** + a **scheduled hard-purge** after a retention window. Default-exclude via a single enforced boundary (RLS here), not per-query discipline.
- Versioning = **coarse, commit-boundary snapshots** (not per-keystroke) for the common case; **CRDT snapshots** only when true blame/diff is required.
- **Heavy payloads → object storage; thin pointers/metadata → the database.**

---

## 7. Recommended phased plan

**Phase 0 — Foundations**
- Add `deleted_at` / `deleted_by` to `productEntityColumns`; backfill NULL.
- Convert product-entity `unique(...)` constraints (start with `pages_group_order`) to partial unique indexes `WHERE deleted_at IS NULL`.
- Verify immutability triggers allow the soft-delete UPDATE.

**Phase 1 — Soft delete read/write path**
- Extend `tenantSelectPolicy()` to add `deleted_at IS NULL`; add a `tenantReadWithDeleted()` escape hatch (session var) for trash/restore/purge.
- Switch page & attachment delete operations from `db.delete(...)` to a `deleted_at`/`deleted_by` UPDATE.
- Add `restore` operations + permissions; add a trash list path.

**Phase 2 — CDC / sync integration**
- Teach CDC to map `deleted_at` NULL→ts as a logical **delete** (count decrement, seq bump, SSE delete) and ts→NULL as a **restore** (count increment, list re-add).
- Add a "changes-including-tombstones" mode to `seqCursor` catchup; keep default lists tombstone-free.
- Update/extend `backend/tests/security/cross-org.test.ts` and sync tests for soft-delete visibility and convergence.

**Phase 3 — Hard-purge job + attachment object cleanup**
- Scheduled `admin_role` job that hard-deletes rows past retention and removes their S3 objects (and rich-text version objects).

**Phase 4 — Rich-text versioning (Model 1 + Option B)**
- `rich_text_versions` pointer table; on each durable `description` commit, write the BlockNote JSON to object storage (immutable key, content-hash dedup) and insert a pointer row stamped with `seq`/`createdBy`.
- History UI: list versions, preview (render JSON read-only), restore (write old content back through the mutation so it re-syncs).
- Enable bucket versioning + noncurrent-version lifecycle expiry on the versions bucket as defense-in-depth.

**Phase 5 (optional) — Yjs snapshots (Model 2)**
- Extend the Yjs worker to run docs with `gc = false` and persist `encodeSnapshot` at commit boundaries (object storage + pointer rows), with compaction. Only if character-level blame/diff is required.

---

## 8. Open questions & risks

1. **RLS read-filter cost.** Adding `deleted_at IS NULL` to product-entity SELECT policies is cheap (indexable), but confirm with the partial indexes that delete/restore-heavy workloads stay fast.
2. **Catchup tombstone window.** How long must logically-deleted rows remain visible to `seqCursor` so all offline clients converge before hard purge? Retention window must exceed the maximum expected offline period.
3. **Restore vs. reclaimed unique slots.** Restoring a page whose `(parentId, displayOrder)` was reused needs a reorder/relocation step — define the UX.
4. **Cascading soft delete depth.** Self-referential `pages.parentId`: soft-deleting a parent should soft-delete descendants in the same transaction (and restore should be scoped/explicit, not auto-resurrect everything).
5. **Object-storage / Postgres consistency.** Versions write must be idempotent and orphan-tolerant (object exists but pointer write failed, or vice-versa); the purge job reconciles.
6. **Versioning granularity.** One version per blur/commit is a deliberate UX choice; debounce/coalesce rapid commits to avoid version spam. Consider explicit "save version" (named checkpoint) alongside auto-versions.
7. **Cost.** Object storage is cheap, but unbounded version history per document isn't free — lifecycle expiry + "keep last N / last 90 days" policy needed.

---

## 9. TL;DR

- **Soft delete:** add `deleted_at`/`deleted_by` to `productEntityColumns`, enforce default-exclusion at the **RLS boundary**, convert affected uniques to **partial unique indexes**, and — the hard part — teach **CDC** to treat the `deleted_at` transition as a logical delete/restore (seq bump + count delta + SSE) so the sync engine and offline clients converge. Add a retention-based hard-purge job.
- **Rich-text versioning:** BlockNote has no built-in store; Yjs gives you snapshots (`gc=false` + `createDocFromSnapshot`), and Tiptap's snapshot extension is the reference for this stack. Start simple with **commit-boundary materialized revisions**, and **store the payloads in Scaleway object storage** to keep Postgres lean.
- **Scaleway S3 versioning:** good instinct, but prefer a **Postgres pointer table + immutable content-addressed objects (Option B)** as the system of record, using native **bucket versioning + lifecycle expiry as defense-in-depth** rather than the primary mechanism. You'll want the relational index for the history UI, tenant isolation, and clean restore-through-sync.

---

## 10. Follow-up: soft-delete cascade across the delete seam

> Q: Is there a best-practice way to make a soft delete **cascade** like `ON DELETE CASCADE` does in the DB model? A known pattern, library, or pg extension?

### 10.1 The hard truth: Postgres can't do it natively

`ON DELETE CASCADE` only fires on a physical `DELETE`. A soft delete is an `UPDATE` (`deleted_at = now()`), so **no FK cascade runs**. There is **no "ON SOFT DELETE CASCADE"** in Postgres and **no widely-adopted pg extension** that provides it. (`temporal_tables` and SQL:2011 system-versioning are about *history*, not soft-delete propagation.) So cascade must be **emulated**, and the only real choices are *where*:

1. **Application-layer recursive cascade** (recommended): in the delete operation, compute all descendants and `UPDATE … SET deleted_at` them in one transaction.
2. **Trigger-based cascade**: a BEFORE/AFTER UPDATE trigger on the parent that propagates the `deleted_at` transition to children, mirroring FK semantics inside the DB.
3. **Read-time hiding** of orphans via recursive CTE (fragile — avoid).

### 10.2 Library landscape (none fit Drizzle cleanly)

Soft-delete-cascade exists in *other* ecosystems, always emulated at the ORM layer — never via a pg extension:

| Ecosystem | Mechanism | Cascade support |
|---|---|---|
| **Drizzle** (Cella) | none — no soft delete, no global scopes | ❌ nothing built-in |
| Prisma | community middleware (now discouraged) | ❌ no real cascade |
| TypeORM | `@DeleteDateColumn` + `softRemove()` | ✅ cascades over relations marked `cascade` |
| Sequelize | `paranoid: true` | ❌ single-table only |
| Rails | `paranoia` / `discard` gems | ✅ via `dependent: :destroy` callbacks |
| Django | `django-safedelete` | ✅ `SOFT_DELETE_CASCADE` policy |

Takeaway: the mature implementations (TypeORM, Django, Rails) all do **app-layer recursive propagation through a known relationship graph**. Since Cella is on Drizzle (which has none of this), we build the same thing — but we have an advantage the others don't.

### 10.3 The Cella-native approach: drive cascade from the entity hierarchy

Cella already has the **single source of truth for parent→child relationships**: the `EntityHierarchy` from `createEntityHierarchy()` (`shared/src/config-builder/`), with `getOrderedDescendants()` / `getChildren()`. This same graph already drives RLS, counts, and SSE routing. So a soft-delete cascade should **reuse it** rather than hardcode relationships or hide logic in triggers:

```
softDeleteCascade(ctx, entityType, ids):
  in one transaction:
    for each descendantType in hierarchy.getOrderedDescendants(entityType):
      UPDATE <descendantTable>
        SET deleted_at = now(), deleted_by = :userId
        WHERE <parentIdColumn> IN (ids of just-deleted ancestors) AND deleted_at IS NULL
    UPDATE <entityType table> SET deleted_at = now(), deleted_by = :userId WHERE id = ANY(ids)
```

- **Self-referential trees** (e.g. `pages.parentId`) need a **recursive CTE** to gather all descendant pages within the same table before marking them.
- **Existing physical cascades that should mirror in soft form**: `attachments` has a composite FK `(tenantId, organizationId) → organizations` `ON DELETE CASCADE` ([backend/src/modules/attachment/attachment-db.ts](../backend/src/modules/attachment/attachment-db.ts)) — but orgs are context entities (hard-deleted, out of this scope). Within product entities the only self-cascade case today is the `pages` tree (currently `parentId … onDelete: 'set null'`).
- **Do it in the operation seam, not a trigger.** Keeping it in `deletePagesOp` / `deleteAttachmentsOp` means each cascaded `UPDATE` flows through WAL → CDC → SSE naturally (clients see each descendant disappear), it's debuggable, and it respects per-entity business rules. A trigger would be "magic," fight the immutability triggers, and risk surprising CDC floods.
- **Batch the flood.** A cascade can mark many rows; reuse the existing **bulk-notification batching** (one SSE per `entityType/action/context`, per [ARCHITECTURE.md](./ARCHITECTURE.md)) so a cascade emits batched stamped updates, not a per-row storm.

**Verdict:** no library, no pg extension — emulate cascade in the operation layer, **driven by the existing `EntityHierarchy` graph + a recursive CTE for self-referential trees, all in one transaction.** This is strictly better than a generic library because it reuses the same relationship config the rest of the sync engine trusts.

---

## 11. Follow-up: does soft delete *simplify* the sync engine?

> Q: The activities table already hard-prunes after a window. If we only hard-delete entities after that same window, does "delete" stop being special and just become another mutation — simplifying the sync engine?

**Short answer: yes — and it also *hardens* it. This is the strongest architectural argument for soft delete.** The condition is **retention-window alignment**.

### 11.1 The key fact that makes this work

The `activities` table is **partitioned by `pg_partman`, weekly, with 90-day retention** ([backend/src/modules/activities/activities-db.ts](../backend/src/modules/activities/activities-db.ts)). That 90-day window **is** the sync engine's catchup horizon: it's the furthest back an offline/reconnecting client can ever replay via `seqCursor`. The sync engine only has to faithfully represent changes **within** that horizon.

### 11.2 Today, "delete" is a special case in several places

- **CDC**: deletes are **not** seq-stamped (`isStampable` = create/update only); they take a separate `delete` activity branch with count decrement.
- **Client**: Phase-A catchup does **direct patch-deletes** into detail + list caches, and the **count-integrity check** is effectively the *primary* way a client learns about deletes it missed while offline.
- **seqCursor**: deletes **don't ride the seq delta stream** — a client that misses a delete activity relies on count-integrity to notice. That's a weaker, backstop-grade signal.

### 11.3 With soft delete + aligned purge, delete collapses into the update path

If a delete is `deleted_at = now()` (an `UPDATE`) and the **destructive hard-`DELETE` only happens after the 90-day horizon**, then:

- A delete is **a normal mutation** → it gets **seq-stamped** like any field change → it rides the **same `seqCursor` delta path** as everything else. Offline clients converge through the ordinary catchup mechanism — no delete-specific cache surgery.
- The client just observes `deletedAt` flip to non-null. The list query (filtered to live rows) drops it; the detail cache marks it gone. It is *literally* "an update to the `deletedAt` field."
- **Restore** is the symmetric update (`deletedAt → null`) — also free, no special path.
- The eventual **hard purge** happens **outside** the horizon, so by definition **no client still needs that row** (its seq history already aged out). The purge `DELETE` is a **cold no-op** for sync: clients dropped the row 90 days ago. CDC can either ignore it or let it emit a delete activity nobody acts on.

### 11.4 What gets simpler — and what gets *better*

| Concern | Today (hard delete) | Soft delete + aligned purge |
|---|---|---|
| CDC delete branch | special, no seq stamp | **gone** — delete is a stamped update |
| Client catchup | patch-delete surgery + count-integrity as primary delete signal | **plain delta apply**; list filter hides it |
| `seqCursor` convergence for deletes | ❌ deletes don't ride seq (count-integrity backstop) | ✅ **deletes ride seq like everything else** |
| Restore | n/a (gone forever) | symmetric update, free |
| Count-integrity check | *primary* delete-recovery mechanism | demoted to **pure backstop** (robustness win) |

The standout win: **deletes gain reliable, ordered, seq-based convergence** they don't have today. So this isn't just less code — it closes a latent gap where an offline client could miss a delete and only catch it via the coarser count check.

### 11.5 The load-bearing invariant (don't get this wrong)

```
hard-purge window  ≥  activities/seq retention window (90 days)
```

The soft-deleted **tombstone row must stay present and queryable for at least as long as the catchup horizon.** If you purge a row *before* a client's maximum offline period, that client never saw the `deletedAt` update **and** the row is gone — it can resurrect or go permanently stale. Aligning purge to (or beyond) the existing 90-day activities retention makes this fall out naturally — an elegant reuse of a horizon Cella already maintains.

### 11.6 The small residue of delete-awareness that remains

Soft delete doesn't make delete logic *vanish* entirely — it shrinks to three small, non-critical pieces:

1. **Read filter** — lists/detail exclude `deleted_at IS NOT NULL` (enforced once at the RLS boundary, §3.2). A read concern, not sync logic.
2. **"Catchup deltas include tombstones" mode** — the normal list hides deleted rows, but the `seqCursor` delta query must *surface* the `deletedAt` transition so clients learn of deletions. Since a soft delete is just a change that bumped `seq`, this is a one-line filter difference, not a separate code path.
3. **Cold purge acknowledgment** — when the hard `DELETE` finally runs post-horizon, CDC can treat it as a harmless no-op (clients already dropped the row).

Compared to today's machinery (CDC delete branch + no-seq-stamp special case + client patch-delete + count-integrity-as-primary-signal), that's a clear net reduction **and** a correctness upgrade.

### 11.7 Verdict

Done with **aligned retention windows**, soft delete is a genuine **simplification and hardening** of the sync engine: delete stops being a special case and becomes "a mutation that sets `deletedAt`," riding the same seq/catchup path as every other change; the destructive operation is pushed outside the sync horizon where it's inert. This reframes the §3.3 work — instead of teaching CDC elaborate "UPDATE-that-means-delete" semantics, the cleaner framing is **"delete is just an update; the only delete-specific logic is a read filter + a tombstone-inclusive catchup query."** That is arguably the single most compelling reason to adopt soft delete here.
