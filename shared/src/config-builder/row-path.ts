import type { AncestorSource } from './resolve-row-channel';

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
  const rootFirst = [...hierarchy.getOrderedAncestors(entityType)].reverse();
  if (rootFirst.length === 0) return null;

  const segments: string[] = [];
  for (const type of rootFirst) {
    const id = row[`${type}Id`];
    if (typeof id === 'string' && id) segments.push(id);
  }
  // The root (organization) ancestor is structurally non-null for every product/channel
  // below it; a row without it has no addressable subtree.
  const rootId = row[`${rootFirst[0]}Id`];
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
