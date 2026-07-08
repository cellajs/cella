import type { ContextEntityType, ProductEntityType } from '../../types';
import type { SubjectForPermission } from './permission-manager/types';

/**
 * Public read mode: subject-level grant that makes rows readable by any actor, including
 * anonymous, based on row data, independent of memberships. See `README.md` for the mode
 * semantics and the cross-row (`publicParent`) design.
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
