/**
 * Published-row lifecycle for product entities.
 *
 * A product table opts in by adding a nullable `publishedAt` timestamp (see
 * `backend/src/db/utils/published-column.ts`). While `publishedAt` is NULL the row is an
 * author-only draft: it is dropped from SSE dispatch, excluded from collection and delta
 * reads, never counted or stamped, and readable/editable only by its author. Setting
 * `publishedAt` is the row's public birth — counters, stamps and unseen badges all fire
 * from the publish edge.
 *
 * Distinct from the channel-entity `publishedAt` (defaults to now; gates invitees during
 * setup) and from `publicAt` (grants NON-members public read). Tables without the column
 * are always-published: both helpers treat an absent column as published, so every
 * consumer is dormant in apps that never add the column.
 */

/**
 * True when the row is an unpublished draft. Strict `=== null`: a table without the
 * column yields `undefined` and is treated as published.
 */
export function isUnpublishedDraft(row: Record<string, unknown> | null | undefined): boolean {
  return row?.publishedAt === null;
}

/**
 * Row-level visibility of drafts: published rows are visible to anyone the permission
 * engine allows; a draft is visible to its author alone. Fail-closed: a draft with no
 * readable `createdBy` (or an anonymous actor) matches nobody, system admins included.
 */
export function draftVisibleTo(row: Record<string, unknown> | null | undefined, userId: string | null | undefined): boolean {
  if (!isUnpublishedDraft(row)) return true;
  return typeof userId === 'string' && userId.length > 0 && row?.createdBy === userId;
}
