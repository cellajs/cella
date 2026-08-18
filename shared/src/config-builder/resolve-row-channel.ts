import { toColumnName } from '../permissions/schema-naming.ts';

/** The minimum attribution needs, so tests can inject a synthetic hierarchy. */
export interface AncestorSource {
  getOrderedAncestors(entityType: string): readonly string[];
  getNullableAncestors(entityType: string): readonly string[];
}

/**
 * The id-column key convention (`project` to `projectId`). Config validation pins
 * `appConfig.entityIdColumnKeys` to this shape, so it also holds for entity types absent from
 * the current app's config.
 */
export const entityIdColumnKey = (entityType: string): string => `${entityType}Id`;

export const entityIdColumnName = (entityType: string): string => `${toColumnName(entityType)}_id`;

export interface ResolvedAncestor {
  /** Ancestor channel type (e.g. 'project'). */
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
    const idColumn = entityIdColumnKey(type);
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
    const id = row[entityIdColumnKey(type)];
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

/**
 * Homes under the deepest-non-null rule: the declared parent, plus each further ancestor while
 * everything below it is nullable. A row never attaches above a non-nullable ancestor.
 */
export function possibleHomeChannels(hierarchy: AncestorSource, entityType: string): string[] {
  const nullable = new Set(hierarchy.getNullableAncestors(entityType));
  const homes: string[] = [];
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    homes.push(ancestor);
    if (!nullable.has(ancestor)) break;
  }
  return homes;
}
