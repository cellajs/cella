/**
 * Row-to-context attribution: which context "owns" a row. See README.md in this directory
 * for the full rule and why every attribution site must share it.
 */

/** Minimal hierarchy surface needed for attribution: lets tests inject a synthetic hierarchy. */
export interface AncestorSource {
  getOrderedAncestors(entityType: string): readonly string[];
  getNullableAncestors(entityType: string): readonly string[];
}

export interface ResolvedAncestor {
  /** Ancestor context type (e.g. 'project'). */
  type: string;
  /** The row's id column for it (e.g. 'projectId'). */
  idColumn: string;
  /** Non-null ancestor row id. */
  id: string;
}

/** All non-null ancestors of a row, most-specific → root. */
export function resolveNonNullAncestors(
  hierarchy: AncestorSource,
  entityType: string,
  row: Record<string, unknown>,
): ResolvedAncestor[] {
  const ancestors: ResolvedAncestor[] = [];
  for (const type of hierarchy.getOrderedAncestors(entityType)) {
    const idColumn = `${type}Id`;
    const id = row[idColumn];
    if (typeof id === 'string' && id) ancestors.push({ type, idColumn, id });
  }
  return ancestors;
}

/** The row's effective home context id: deepest non-null ancestor. Null when every ancestor id is null. */
export function resolveDeepestAncestorId(
  hierarchy: AncestorSource,
  entityType: string,
  row: Record<string, unknown>,
): string | null {
  for (const type of hierarchy.getOrderedAncestors(entityType)) {
    const id = row[`${type}Id`];
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

/**
 * Context types that can be a row's effective home under the deepest-non-null rule:
 * the declared parent, plus each further ancestor while everything below it is nullable
 * (rows can never attach above a non-nullable ancestor). Without nullable ancestors this
 * is just the declared parent.
 */
export function possibleHomeContexts(hierarchy: AncestorSource, entityType: string): string[] {
  const nullable = new Set(hierarchy.getNullableAncestors(entityType));
  const homes: string[] = [];
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    homes.push(ancestor);
    if (!nullable.has(ancestor)) break;
  }
  return homes;
}
