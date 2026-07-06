import type { ContextEntityType, ProductEntityType } from '../../types';
import type { SubjectForPermission } from './permission-manager/types';

/**
 * Public read: subject-level grants that make rows readable by ANY actor — anonymous
 * included — based on row data, independent of memberships.
 *
 * - `publicSelf`: readable when the row's own `publicAt` timestamp is set.
 * - `publicParent`: readable when the parent context row's `publicAt` is set.
 * - `publicParentOrSelf`: either of the above.
 *
 * Declared per subject in the permissions config (`configurePermissions` →
 * `publicRead(mode)`), evaluated by the permission engine for the `read` action, and
 * attributed as `grantedBy: { type: 'public', mode }`. This replaces the former
 * `publicRead` key on the entity hierarchy and the hand-rolled `if (!row.publicAt)`
 * checks in public route handlers — one declaration, every path.
 *
 * `publicParent` reads *another row's* field. Per the cross-row design decision
 * (load-at-check, resolved once per request/event), the caller resolves the parent row
 * and passes it as `subject.parentRow`; the engine never loads rows itself. A subject
 * without `row`/`parentRow` simply never matches — paths that don't resolve row data
 * (e.g. stream dispatch today) are unaffected.
 */
export type PublicReadMode = 'publicSelf' | 'publicParent' | 'publicParentOrSelf';

/** Per-subject public read grants, keyed by entity type. */
export type PublicReadGrants = Partial<Record<ContextEntityType | ProductEntityType, PublicReadMode>>;

const publicAtSet = (row: Record<string, unknown> | undefined): boolean => !!row?.publicAt;

/** Check-form: does the subject's row data satisfy the public read grant? */
export const publicReadMatches = (mode: PublicReadMode, subject: SubjectForPermission): boolean => {
  switch (mode) {
    case 'publicSelf':
      return publicAtSet(subject.row);
    case 'publicParent':
      return publicAtSet(subject.parentRow);
    case 'publicParentOrSelf':
      return publicAtSet(subject.row) || publicAtSet(subject.parentRow);
  }
};
