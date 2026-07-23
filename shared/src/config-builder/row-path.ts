import { type AncestorSource, entityIdColumnKey, entityIdColumnName } from './resolve-row-channel';

/**
 * Builds a root-first path from populated ancestor IDs, optionally appending a channel row's ID.
 * Returns null without the root. Tests keep this aligned with the backend generated-column SQL
 * and the deepest-ancestor attribution rule.
 */
export function computeAncestorPath(
  hierarchy: AncestorSource,
  entityType: string,
  row: Record<string, unknown>,
): string | null {
  // getOrderedAncestors is most-specific → root; paths are root-first.
  const [root, ...deeper] = [...hierarchy.getOrderedAncestors(entityType)].reverse();
  if (root === undefined) return null;

  const segments: string[] = [];
  for (const type of [root, ...deeper]) {
    const id = row[entityIdColumnKey(type)];
    if (typeof id === 'string' && id) segments.push(id);
  }
  // The root (organization) ancestor is structurally non-null for every product/channel
  // below it; a row without it has no addressable subtree.
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

/**
 * A channel row's path: its ancestor chain plus its own id. The root channel
 * (no ancestors) is just its own id.
 */
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
 * SQL twin of {@link computeAncestorPath} / {@link computeChannelPath}, kept adjacent so the
 * two rules stay provably identical (see the path parity tests). Produces the generated-column
 * expression `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || ...`,
 * appending `'/' || "id"::text` when `appendOwnId` (channel entities). The expression updates
 * atomically on reparenting, skips nullable intermediate ancestors, and requires a non-null
 * root organization.
 */
export function pathColumnSql(hierarchy: AncestorSource, entityType: string, appendOwnId: boolean): string {
  // getOrderedAncestors is most-specific → root; path segments are root-first.
  const [root, ...deeper] = [...hierarchy.getOrderedAncestors(entityType)].reverse();

  // Root channel (organization): the path is its own id.
  if (root === undefined) return `"id"::text`;

  const parts = [`"${entityIdColumnName(root)}"::text`];
  for (const ancestor of deeper) {
    parts.push(`COALESCE('/' || "${entityIdColumnName(ancestor)}"::text, '')`);
  }
  if (appendOwnId) parts.push(`'/' || "id"::text`);
  return parts.join(' || ');
}

/**
 * SQL twin of `resolveDeepestAncestorId`: a COALESCE over the aliased ancestor id columns,
 * most-specific first. Null when the entity has no ancestors.
 */
export function deepestAncestorSql(hierarchy: AncestorSource, entityType: string, alias: string): string | null {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  if (!ancestors.length) return null;
  return `COALESCE(${ancestors.map((a) => `${alias}.${entityIdColumnName(a)}`).join(', ')})`;
}
