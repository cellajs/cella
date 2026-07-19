import type { AncestorSource } from './resolve-row-channel';

/**
 * Slash-joined non-null ancestor ids, root-first. Null when the root ancestor id is missing.
 *
 * Materialized id-path rule (sequence sync). A row's path is its ancestor channel ids
 * root-first, slash-joined, skipping null ancestors (variable-depth rows). For example,
 * `org1/course7/project9` for a project-homed item whose section level is unset.
 * Channel entities append their own id: a course's path is `org1/course7`.
 *
 * The SQL twin lives in `backend/src/db/utils/path-column.ts` as a STORED generated
 * column; `row-path.test.ts` and the backend path-column test assert the two agree.
 * The LAST path segment always equals `resolveDeepestAncestorId` (products) or the
 * row id (channels): the pre-path attribution rule, kept equivalent by tests.
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
