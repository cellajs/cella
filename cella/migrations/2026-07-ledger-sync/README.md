# Ledger sync migration (org ledger + id-paths + view-driven catchup)

Upstream rewrote the sync engine's addressing layer. **This is a breaking change to the
sync wire contract and to seq semantics** — read this whole guide before pulling.
Design rationale and decisions: `.todos/LEDGER_SYNC_REWRITE.md`; engine reference:
`cella/SYNC_ENGINE.md`.

What changed, in one paragraph: `seq` values are now **one totally-ordered ledger per
organization** shared by all product entity types (reserved via `s:ledger` on the org's
`channel_counters` row; WAL order = ledger order). Every channel/product table gains a
STORED generated **`path`** column (root-first ancestor ids, slash-joined) via
`channelEntityColumns`/`productEntityColumns` — no write-path changes, reparents update
it atomically. Per-node summaries got a new family: **`f:{type}`** frontiers
max-merged at the org and every non-null ancestor. Catchup is **view-driven**: the
client declares `{prefixes, entityTypes, cursor}` views, the server authorizes each
prefix (`resolveViewReadStatus`: ok/opaque/forbidden — node-id-only proof) and answers
from `f:`/`e:` rollups. Reparented rows additionally emit **`moveOut`** notifications
to subscribers who lost visibility. The legacy flat-seqs catchup contract,
`childChannelChanges`, per-scope `s:{entityType}` counters, and the CDC org-signal are
**gone**.

Two engine bugs this closes (relevant if your fork hit them): elevated readers without
child memberships were invisible to membership-derived catchup discovery, and nobody was
told when a row LEFT their readable subtree (reparent) — dispatch only evaluated the new
row.

---

## Does my fork need to do anything?

Yes — every fork. The engine core (cdc/, `backend/src/modules/entities`,
`frontend/src/query`) arrives via `pnpm cella` pull since forks run it unmodified, but
fork-owned surfaces must follow:

1. **Drizzle migrations** (fork-owned `backend/drizzle`): regenerate + restamp (below).
2. **Product entity modules**: add `pathPrefix` to list ops (template pattern) and keep
   `seqCursor` semantics (values are now org-ledger; the endpoint shape is unchanged).
3. **Mocks/tests**: every product/channel mock needs the `path` field (mirror the SQL
   rule via `computeProductPath`/`computeChannelPath` from `shared`); fork parity tests
   must be re-run — `canReceiveEntityEvent` and the collection-scope engine are
   UNCHANGED, so permission parity should hold as-is.
4. **Client**: nothing per-module — delta-fetch registrations keep working (they were
   already org-wide `seqCursor` calls). The catchup flip and `moveOut` handling are in
   the synced engine. `clientCacheVersion` was bumped upstream (`v2-ledger`); if your
   fork owns its config, bump yours.

## Upgrade steps (any fork)

```sh
pnpm cella                       # pull upstream (expect conflicts on pinned files only)
pnpm --filter backend generate   # fork-owned drizzle: path columns + side_effects
                                 # (apply_count_deltas gains the f:/GREATEST class)
```

Then, per product entity module (copy the attachment template):

- `<entity>-schema.ts`: add `pathPrefix: z.string().max(512).optional()` to the list
  query schema.
- `operations/get-<entities>.ts`: destructure `pathPrefix`; add
  `filters.push(...pathPrefixFilter(<table>.path, pathPrefix))` (from
  `#/utils/seq-cursor`) after the seqCursor filters; exclude `pathPrefix` reads from
  counter-based totals (see `counterEligible` in `get-attachments.ts`).
- `<entity>-mocks.ts`: add `path` (use `computeProductPath(hierarchy, '<type>', row)`).

**Deploy order (per environment):** snapshot DB → `pnpm migrate` (adds path columns,
regenerated side effects) → deploy backend + CDC → **restamp** (below) → run counter
recalculation (`pnpm seed counters` or your recalc runbook — it rebuilds `s:ledger`,
`f:{type}`, `e:{type}`) → deploy frontend. Old PWA bundles get a graceful 400 on the
old catchup shape and ride the documented fallback chain until the update prompt lands.

### Restamp (required on populated databases)

Row `seq` values must be renumbered into one org-wide order. Run once per environment,
AFTER migrating and BEFORE recalculation, with the CDC worker STOPPED:

```sql
-- Repeat per product table, all in one transaction; ordering by (created_at, id)
-- gives a deterministic org-wide order. New writes then continue from s:ledger.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY organization_id ORDER BY created_at, id
  ) AS rn
  FROM <product_table>
)
UPDATE <product_table> t SET seq = ordered.rn FROM ordered WHERE t.id = ordered.id;
```

With MULTIPLE product tables, number them jointly (union the tables in `ordered` with a
`tbl` discriminator so the partition spans all of them) — the ledger is shared. Then run
recalculation, which sets `s:ledger` to the max stamped value per org. Clients cache-bust
via the `clientCacheVersion` bump and re-baseline on first catchup — stored watermarks
are discarded, so old-domain cursors never meet new-domain values.

### Verification checklist

- `pnpm -r ts` and full test suites green (the upstream suites cover the engine; your
  fork parity tests cover your hierarchy).
- The `(organization_id, seq)` delta-index invariant test passes for every product table
  (upstream `delta-index.test.ts` — it will name any fork table missing the index).
- Manual: `pnpm offline` — post in one tab, verify live sync in a second tab; go
  offline/online and verify catchup; reparent a row (if your fork supports it) and
  verify it disappears for a user who cannot read the new location.

---

## projectcampus notes

- **Sequencing:** land the in-flight drizzle-baseline squash and the prod Path B
  baseline adoption (`2026-07-drizzle-baseline` guide) BEFORE this migration.
- Six product modules follow the per-module steps (item, comment, submission, material,
  label; attachment arrives migrated). Item/comment keep their `publishedAt` draft
  machinery untouched: drafts still get ledger stamps and stay invisible to dispatch,
  delta reads, counters, and unseen badges until the publish edge.
- The elevation fix is your headline, with precise wording: staff with course-only
  memberships are now CORRECT at catchup (their org view answers `opaque` → cached
  lists invalidate and refetch; the old engine silently skipped their gaps). They
  become PRECISE (`ok`, exact gap fetches) once the fork declares course-prefix views
  — the wire and authorization already support it. Add a fork regression test
  asserting a staff member's COURSE-prefix view answers `status: 'ok'` and their
  org-prefix view answers `opaque`.
- Feeds unlock: a course feed = `pathPrefix: '<orgId>/<courseId>'` on the item list op
  (server) with the existing canonical-list pattern (client). Exact-placement params
  (`courseId` + NULL deeper columns) keep working unchanged for per-level streams.
- Verified ancestry: after pulling the follow-up phases, re-run counter recalculation —
  it backfills `channel_counters.path`, which flips ancestor-granted deep views (staff →
  a project under their course) from conservative `opaque` to `ok`.
- Grant-boundary views: wire `deriveGrantBoundaryViews` + `declareSyncView`
  (frontend `query/realtime/views.ts`) when adding feed surfaces; the re-baseline rule
  (prefix-set changes reset the cursor) is enforced by the store.
- Self vs subtree views: declare `depth: 'self'` for a channel's own wall (course/section
  streams) — answerable `ok` by DIRECT memberships (students included, via their
  home-scoped grants); `depth: 'subtree'` (default) for aggregate feeds — `ok` only for
  subtree-scoped readers (staff at the node, org admins). See "Readability ×
  answerability" in SYNC_ENGINE.md for the full matrix.
- Restamp spans items, comments, submissions, materials, labels, attachments jointly.

## raak notes

- **Workspace is a SIBLING of project** (not an ancestor): task paths are
  `org/project`. A workspace board's future feed view = the prefix SET of its member
  projects (expand workspace → projects client-side); nothing changes for the current
  per-project board composition.
- Task/label are project-homed with NOT NULL `projectId`; attachment is variable-home
  (org or project) — all covered by the generated path expression automatically.
- Replace the per-channel keyset indexes (`tasks_project_seq_index (project_id, seq)`)
  with the `(organization_id, seq)` convention — the invariant test will flag them.
- Yjs: `registerYjsOwnedFields` suppression is untouched — ledger delta rows still skip
  Yjs-owned fields while an editor is active.
- Embeddings (`label → task.labels`): propagation hints now derive from view cursors vs
  `f:label`; behavior is equivalent. The CDC embedding-cleanup path is unchanged.
- De-hosted attachments stay de-hosted; `publicat_cascade` and partman retention are
  unaffected (the ledger is not the activity id).
- Restamp spans tasks, labels, attachments jointly.
