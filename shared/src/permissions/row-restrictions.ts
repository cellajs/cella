import type { ContextEntityType, ProductEntityType } from '../../types';
import type { SubjectForPermission } from './permission-manager/types';

/**
 * Row restrictions narrow membership grants per row (`visibilityDepth`, `audienceRoles`,
 * `exemptRoles`); row-condition grants and public read grants are never narrowed, and
 * `create` is never restricted. See `README.md` for the full semantics.
 */

/** Restriction declaration as written in the permissions config. */
export interface RowRestrictionInput {
  /** Enable depth restriction; `true` uses the `visibilityDepth` column. */
  visibilityDepth?: true | { column: string };
  /** Enable audience-role restriction; `true` uses the `audienceRoles` column. */
  audienceRoles?: true | { column: string };
  /** Role names whose grants bypass this restriction (e.g. `['admin']`). */
  exemptRoles?: readonly string[];
}

/** Normalized restriction (column names resolved). */
export interface RowRestriction {
  depthColumn?: string;
  rolesColumn?: string;
  exemptRoles: readonly string[];
}

/** Per-subject row restrictions, keyed by entity type. */
export type RowRestrictions = Partial<Record<ContextEntityType | ProductEntityType, RowRestriction>>;

/** Normalize a restriction declaration: resolve default column names. */
export const normalizeRestriction = (input: RowRestrictionInput): RowRestriction => {
  if (!input.visibilityDepth && !input.audienceRoles) {
    throw new Error('[Permission] restrict() needs at least one of visibilityDepth / audienceRoles');
  }
  return {
    ...(input.visibilityDepth && {
      depthColumn: input.visibilityDepth === true ? 'visibilityDepth' : input.visibilityDepth.column,
    }),
    ...(input.audienceRoles && {
      rolesColumn: input.audienceRoles === true ? 'audienceRoles' : input.audienceRoles.column,
    }),
    exemptRoles: input.exemptRoles ?? [],
  };
};

/**
 * The depth values a grant at `grantContextType` qualifies for, given the subject's
 * ordered context chain (most specific first): the grant's own level and every LESS
 * specific level. Shared by the check-form below and the backend SQL compiler so both
 * forms derive qualification from the same list.
 */
export const qualifyingDepths = (
  orderedContexts: readonly ContextEntityType[],
  grantContextType: ContextEntityType,
): ContextEntityType[] => {
  const grantIndex = orderedContexts.indexOf(grantContextType);
  if (grantIndex === -1) return [];
  return orderedContexts.slice(grantIndex);
};

/**
 * Check-form: does a membership grant (context type + role) qualify for this row under
 * the restriction? Fail-closed on missing row data; unknown depth values never qualify.
 */
export const membershipGrantQualifies = (
  restriction: RowRestriction,
  subject: SubjectForPermission,
  orderedContexts: readonly ContextEntityType[],
  grantContextType: ContextEntityType,
  grantRole: string,
): boolean => {
  if (restriction.exemptRoles.includes(grantRole)) return true;

  const row = subject.row;

  if (restriction.depthColumn) {
    if (!row) return false;
    const depth = row[restriction.depthColumn];
    if (depth != null) {
      if (typeof depth !== 'string') return false;
      if (!qualifyingDepths(orderedContexts, grantContextType).includes(depth as ContextEntityType)) return false;
    }
  }

  if (restriction.rolesColumn) {
    if (!row) return false;
    const roles = row[restriction.rolesColumn];
    if (roles != null && (!Array.isArray(roles) || (roles.length > 0 && !roles.includes(grantRole)))) return false;
  }

  return true;
};
