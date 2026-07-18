# Published-rows lifecycle migration (product-entity drafts)

> **Model update (2026-07, sequence-sync era):** the draft boundary has since moved to
> the replication layer — a publication row filter (`published_at IS NOT NULL`, PG 17+)
> keeps drafts out of the CDC stream entirely, so publish arrives as INSERT and
> unpublish as DELETE (see `cella/SYNC_ENGINE.md` and `cdc/README.md`). The API-side
> predicates below are unchanged and still load-bearing; CDC-side masking described in
> this guide no longer exists.

Adds an opt-in draft lifecycle for **product entities**: a nullable `publishedAt`
timestamp where **NULL = author-only draft, set = published**. While a row is a
draft it is invisible to every upstream subsystem — the replication stream never
carries it, collection/delta/catchup reads exclude it, `e:`
counters and `li:`/`lu:` stamps ignore it, unseen badges never count it, the
detail read 404s for non-authors, the detail cache refuses to serve it to
non-authors, and yjs rejects non-author write connections. The **publish
is the row's public birth**: it counts as a create, stamps `li:` from
`publishedAt`, and lights unseen badges (the badge window keys on
`COALESCE(published_at, created_at)` in both mirrors).

All enforcement ships **upstream and dormant** — every predicate and veto is
column-introspection-guarded, so apps without the column behave exactly as
before. There is no config key: the column IS the contract
(`shared/src/published-rows.ts`).

Distinct from two sibling conventions: the **channel-entity** `publishedAt`
(defaults to now; gates invitees during org setup, not readers) and `publicAt`
(grants NON-members public read).

## Adopting drafts on a fork entity

1. **Add the column**: spread `publishedColumn`
   (`backend/src/db/utils/published-column.ts`) into the entity's `*-db.ts`,
   then `pnpm generate` → one nullable `ADD COLUMN`, no backfill needed for
   always-published tables (see step 5 for `draft`-column forks). Do **not**
   add `published_at` to the immutability trigger lists — publishing mutates it
   by design.
2. **Create ops** decide the birth state: `publishedAt: null` for draft-first
   flows, `getIsoDate()` for publish-on-create.
3. **Publish endpoint** (fork-side): a dedicated route that sets `publishedAt`
   via `resolveServerUpdateOps` (`backend/src/core/stx/resolve-update.ts`) — a
   server action with a server HLC. Do NOT route publish through the generic
   `updateOps` allow-list; a Publish button should not mint client HLC
   timestamps. Unpublish is supported by the machinery (counts as a delete) but
   is a product decision.
4. **Drafts view** (fork-side): the feed no longer returns drafts to anyone, so
   list the author's own drafts with a dedicated query
   (`WHERE created_by = <me> AND published_at IS NULL`), hard-scoped in the op.
   Keep this view out of `seenTrackedEntityTypes` concerns — it is not a feed.
5. **Migrating off a `draft` boolean column** (e.g. projectcampus):

   ```sql
   ALTER TABLE items ADD COLUMN published_at timestamp;
   UPDATE items SET published_at = created_at WHERE draft = false;
   -- draft = true rows stay NULL
   ALTER TABLE items DROP COLUMN draft;
   ```

   Then delete the fork's imperative machinery — the dispatch rule in
   `canReceiveEntityEvent`, the `permissionRowKeys` addition, and any
   handler-side draft checks — all of it now ships upstream. Run
   `pnpm exec tsx` nothing: there is no codemod; this is config/SQL only.
6. **Recount**: run the counter recalculation (seed/admin repair) once after
   the data migration so `e:` counters drop pre-existing drafts.
7. `pnpm sdk` — the column rides into the SDK via the entity's select schema
   automatically.

## Semantics worth knowing

- **Quotas include drafts**: `getOrgEntityCount` falls back to a direct
  `COUNT(*)` (drafts included) for tables with the column, so drafts cannot
  stockpile past the entity quota.
- **Drafts keep create-time seqs**: non-authors' catchup may see a seq bump and
  fetch nothing — harmless; watermarks are gap-tolerant. The publish update
  gets a fresh seq above every watermark, which is what makes it reach clients.
- **`lu:` recalculation nuance**: recalculation aggregates `MAX(updated_at)`
  over published rows, which can include updates made while drafting; CDC only
  stamps post-publish updates. The stamp is a per-stream activity signal, not
  an exact counter, so this drift is accepted (and self-corrects on the next
  post-publish update).
- **Author edits of drafts do not sync**: dispatch drops drafts wholesale, so
  the author's other devices see draft changes on refetch of the drafts view,
  not in realtime. Collaborative editing of a draft still works via yjs — for
  the author alone.
