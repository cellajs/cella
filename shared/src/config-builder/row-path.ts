import { type AncestorSource, entityIdColumnKey, entityIdColumnName } from './resolve-row-channel.ts';

/** Organization-first path from the populated ancestor ids. Null when the organization id is missing. */
export function computeAncestorPath(
  hierarchy: AncestorSource,
  entityType: string,
  row: Record<string, unknown>,
): string | null {
  // getOrderedAncestors is most-specific → organization; paths are organization-first.
  const [root, ...deeper] = [...hierarchy.getOrderedAncestors(entityType)].reverse();
  if (root === undefined) return null;

  const segments: string[] = [];
  for (const type of [root, ...deeper]) {
    const id = row[entityIdColumnKey(type)];
    if (typeof id === 'string' && id) segments.push(id);
  }
  // A row without the organization id has no addressable subtree.
  const rootId = row[entityIdColumnKey(root)];
  if (typeof rootId !== 'string' || !rootId) return null;
  return segments.join('/');
}

/** A product row's path: its non-null ancestor chain. */
export function computeProductPath(
  hierarchy: AncestorSource,
  entityType: string,
  row: Record<string, unknown>,
): string | null {
  return computeAncestorPath(hierarchy, entityType, row);
}

/** A channel row's ancestor chain plus its own id; for the organization, just its own id. */
export function computeChannelPath(
  hierarchy: AncestorSource,
  entityType: string,
  row: Record<string, unknown>,
): string | null {
  const id = row.id;
  if (typeof id !== 'string' || !id) return null;
  const ancestors = computeAncestorPath(hierarchy, entityType, row);
  if (hierarchy.getOrderedAncestors(entityType).length === 0) return id;
  return ancestors === null ? null : `${ancestors}/${id}`;
}

/** Segment-safe prefix test: `o1/c7` covers `o1/c7` and `o1/c7/p9`, never `o1/c71`. */
export function pathStartsWith(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Path segments root-first. */
export function pathSegments(path: string): string[] {
  return path.split('/');
}

/** The deepest (last) segment of a path: equals the row's effective home channel id. */
export function pathHomeId(path: string): string {
  const segments = pathSegments(path);
  return segments[segments.length - 1] ?? path;
}

/**
 * SQL twin of {@link computeAncestorPath} / {@link computeChannelPath}, kept adjacent and held
 * identical by the path parity tests. Produces the generated-column expression
 * `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || ...`, appending
 * `'/' || "id"::text` when `appendOwnId` (channel entities). It updates atomically on
 * reparenting, skips nullable intermediate ancestors, and requires a non-null organization.
 */
export function pathColumnSql(hierarchy: AncestorSource, entityType: string, appendOwnId: boolean): string {
  const [root, ...deeper] = [...hierarchy.getOrderedAncestors(entityType)].reverse();
  if (root === undefined) return `"id"::text`;

  const parts = [`"${entityIdColumnName(root)}"::text`];
  for (const ancestor of deeper) {
    parts.push(`COALESCE('/' || "${entityIdColumnName(ancestor)}"::text, '')`);
  }
  if (appendOwnId) parts.push(`'/' || "id"::text`);
  return parts.join(' || ');
}

/** SQL twin of `resolveDeepestAncestorId`. Null when the entity has no ancestors. */
export function deepestAncestorSql(hierarchy: AncestorSource, entityType: string, alias: string): string | null {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  if (!ancestors.length) return null;
  return `COALESCE(${ancestors.map((a) => `${alias}.${entityIdColumnName(a)}`).join(', ')})`;
}
