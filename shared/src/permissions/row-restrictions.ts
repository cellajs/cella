import type { ContextEntityType, ProductEntityType } from '../../types';
import type { SubjectForPermission } from './permission-manager/types';

/**
 * Row restrictions: subject-level rules that NARROW membership grants per row.
 *
 * Where grants (policy cells, row conditions, public read) only ever widen access,
 * a restriction shrinks a row's audience within the members who would otherwise see it:
 *
 * - `visibilityDepth`: the row column names the least specific context level whose
 *   members may act on the row. A membership grant qualifies only if it was granted by
 *   a context AT LEAST AS SPECIFIC as the row's depth. Example (chain
 *   `project > organization`): a row with depth `'project'` is invisible to grants from
 *   the organization level; a row with depth `'organization'` is visible to grants from
 *   both levels. `null` = no depth restriction.
 * - `audienceRoles`: the row column holds the roles allowed to act on the row; a grant
 *   qualifies only if its role is in the set. Roles qualify per grant at the grant's own
 *   level, so one set can span levels (e.g. course `staff` ∪ project `owner`).
 *   `null` or `[]` = no role restriction.
 * - `exemptRoles`: grants with these roles bypass the restriction entirely. Without an
 *   exemption a depth restriction would lock org admins out of restricted rows — the
 *   exemption must be explicit and declared.
 *
 * Semantics, deliberately:
 * - Restrictions narrow MEMBERSHIP grants only. Row-condition grants (e.g. `'own'` — a
 *   creator always sees their own row) and public read grants are not narrowed.
 * - `create` is never restricted — there is no row yet to restrict on.
 * - **Fail closed**: if a restriction is declared for an entity type but the subject
 *   carries no `row` data, non-exempt membership grants do NOT qualify. Every enforcement
 *   path for a restricted entity must resolve row data (or rely on exempt roles).
 * - No time-based rules: lifecycle changes (e.g. widening a submission after a deadline)
 *   are API-level column rewrites, not engine concepts.
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
