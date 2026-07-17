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
