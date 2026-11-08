/** Segment-safe prefix test: `o1/c7` covers `o1/c7` and `o1/c7/p9`, never `o1/c71`. */
export const pathStartsWith = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** Path segments root-first. */
export const pathSegments = (path: string): string[] => path.split('/');

/** The deepest (last) segment of a path: equals the row's effective home channel id. */
export const pathHomeId = (path: string): string => pathSegments(path).at(-1) ?? path;
