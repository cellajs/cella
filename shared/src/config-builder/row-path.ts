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
