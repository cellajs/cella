If you've already implemented and decided on soft delete, I'd remove everything related to soft-delete design, CDC implications, cascades, RLS filtering, retention alignment, etc., and refocus the document entirely on rich-text versioning.

A cleaner title would be:

# Rich-text field versioning research

**Status:** research / proposal (no code changes yet)
**Scope:** BlockNote / Yjs `description` field versioning
**Author context:** exploratory design doc for Cella core, with Raak as the reference consumer.

This document surveys version-history approaches used by BlockNote/Yjs-based systems, evaluates storing version payloads in Scaleway Object Storage, and proposes a phased implementation plan for field-level history and restore.

---

## 1. Goals & non-goals

### Goals

* Field-level versioning focused on rich-text fields edited with BlockNote (`description`).
* Ability to browse, preview, diff, and restore historical versions.
* Keep Postgres lean by storing large revision payloads outside hot operational tables.
* Integrate naturally with the existing sync engine and mutation flow.

### Non-goals

* Full entity versioning.
* Versioning scalar fields (`name`, `status`, `labels`, etc.).
* Replacing the current sync/merge architecture.
* Durable persistence of live Yjs sessions (separate initiative).

---

## 2. Current architecture

### 2.1 Rich text today: ephemeral Yjs, durable materialized string

The `description` field uses the YATA merge strategy (Yjs CRDT):

* BlockNote connects through `y-websocket` to the standalone Yjs worker.
* The Yjs worker stores transient document state in `yjs_documents`.
* Documents are garbage-collected shortly after all clients disconnect.
* On commit, the client writes the rendered BlockNote JSON through the normal mutation path.
* The entity row's `description` field is the durable source of truth.

### Implication

The natural versioning boundary is the committed `description` payload rather than transient Yjs state.

Versioning committed content:

* aligns with the existing persistence model,
* avoids changing Yjs lifecycle management,
* restores cleanly through normal mutations.

### 2.2 Object storage today

Cella already uses Scaleway Object Storage (S3-compatible) for attachments.

Current capabilities include:

* Versioning
* Lifecycle policies
* Storage classes
* Object Lock / retention policies

The existing AWS SDK integration can be reused for revision storage.

---

## 3. What BlockNote and Yjs provide

### BlockNote

BlockNote does not provide a built-in version-history store.

Version history in the broader BlockNote/Tiptap ecosystem is typically implemented using:

* Hosted collaboration platforms (Liveblocks, Velt, y-sweet)
* Custom Yjs snapshot storage

BlockNote does provide utilities for converting between BlockNote content and Yjs documents without a live editor.

### Yjs

Yjs provides native snapshot support:

* `Y.snapshot()`
* `Y.encodeSnapshot()`
* `Y.createDocFromSnapshot()`

Snapshots represent points-in-time within retained document history.

To support historical reconstruction:

* `gc` must be disabled (`doc.gc = false`)
* historical state must be retained
* periodic compaction becomes necessary

This enables Google Docs–style history and attribution but introduces operational complexity.

---

## 4. Versioning models

### Model 1 — Materialized-content revisions

At each durable commit:

```ts
{
  entityType,
  entityId,
  seq,
  createdBy,
  createdAt,
  content
}
```

where `content` is the BlockNote JSON string stored in `description`.

#### Pros

* Simple implementation
* No Yjs worker changes
* Works with existing sync flow
* Easy restore semantics
* Applies to any rich-text field

#### Cons

* Full snapshots rather than diffs
* No character-level attribution
* Storage duplication without deduplication

---

### Model 2 — Yjs snapshot history

Persist Yjs snapshots alongside a retained Yjs document history.

#### Pros

* Rich diffs
* Attribution
* Historical reconstruction
* Named checkpoints

#### Cons

* Requires `gc = false`
* Increased storage growth
* Snapshot compaction required
* Significant changes to current Yjs lifecycle

---

### Model 3 — Append-only Yjs update log

Persist every Yjs update and periodically compact into snapshots.

Used by systems such as:

* AFFiNE
* Huly
* Hocuspocus persistence providers

#### Pros

* Durable collaboration persistence
* Full historical reconstruction
* Real-time recovery

#### Cons

* Largest architectural change
* Introduces persistence infrastructure
* Solves more than version history

---

## 5. Scaleway object storage evaluation

### Option A — Native bucket versioning

Store revisions under a stable key:

```text
versions/{tenant}/{entity}/{id}/description.json
```

Each write creates a new S3 version.

#### Pros

* Minimal implementation
* Automatic retention
* Built-in rollback capability

#### Cons

* Poor queryability
* History metadata difficult to access efficiently
* Restore still requires application-level coordination
* Weak integration with tenant-scoped queries

---

### Option B — Pointer table + immutable objects

Store metadata in Postgres and payloads in object storage.

```sql
rich_text_versions (
  id,
  entity_type,
  entity_id,
  tenant_id,
  seq,
  created_by,
  created_at,
  storage_key,
  byte_size,
  content_hash,
  label
)
```

Objects are written under immutable keys:

```text
versions/{tenant}/{entity}/{id}/{seq}.json
```

#### Pros

* Efficient history queries
* Easy joins to users and entities
* Strong tenant isolation
* Lightweight Postgres footprint
* Supports content-hash deduplication
* Restore naturally integrates with sync

#### Cons

* Slightly more implementation work
* Requires version bookkeeping

### Recommendation

Use object storage for revision payloads and a lightweight relational index for metadata.

Bucket versioning should be treated as defense-in-depth rather than the primary versioning mechanism.

---

## 6. Industry patterns

| System               | Versioning approach          |
| -------------------- | ---------------------------- |
| Tiptap Pro           | Yjs snapshots                |
| AFFiNE               | Yjs update log + snapshots   |
| Huly                 | Persistent Yjs history       |
| Hocuspocus providers | Update log persistence       |
| Ghost                | Snapshot revisions           |
| WordPress            | Snapshot revisions           |
| Notion               | Snapshot + operation history |
| Dropbox Paper        | Snapshot + operation history |

Recurring patterns:

* Commit-boundary snapshots are sufficient for most users.
* CRDT history is reserved for advanced attribution and diffing.
* Large revision payloads live in object storage.
* Metadata remains in relational storage.

---

## 7. Recommended plan

### Phase 1 — Materialized revisions

Create a lightweight revision index:

```sql
rich_text_versions (...)
```

On each committed `description` update:

1. Write immutable BlockNote JSON to object storage.
2. Insert revision metadata into `rich_text_versions`.
3. Deduplicate using content hashes.
4. Stamp revisions with `seq` and `createdBy`.

### Phase 2 — History UI

Provide:

* Version list
* Metadata (author, timestamp)
* Read-only preview
* Restore action

Restore should:

1. Fetch stored content.
2. Write through the normal mutation path.
3. Let sync propagation happen naturally.

### Phase 3 — Lifecycle management

Add:

* Retention policies
* Expiration rules
* Optional "keep last N versions"
* Storage reconciliation jobs

### Phase 4 (optional) — Yjs snapshots

Only if users need:

* Character-level attribution
* Fine-grained diffing
* Google Docs–style history

At that point:

* Disable Yjs garbage collection
* Persist snapshots
* Add snapshot compaction

---

## 8. Open questions

1. What constitutes a version boundary?

   * Every commit?
   * Debounced commits?
   * Explicit checkpoints?

2. How should history retention work?

   * Last N versions?
   * Time-based retention?
   * Both?

3. Should restores create a new version entry?

   * Most systems treat restore as a new revision.

4. Is diff visualization needed?

   * Snapshot history can ship without diffing.

5. Is character-level attribution actually a user requirement?

   * If not, Yjs snapshot history may never be necessary.

---

## 9. TL;DR

* Version the committed `description` payload rather than transient Yjs state.
* Store revision payloads in Scaleway Object Storage.
* Use a small Postgres metadata table to index versions.
* Start with commit-boundary snapshots.
* Restore through the normal mutation path so sync continues to work unchanged.
* Treat Yjs snapshots as a future enhancement only if users require attribution, blame, or advanced diffing.
