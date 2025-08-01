/**
 * Validate base path for redirects. If its valid, it returns the path.
 */
export function isValidRedirectPath(path: unknown) {
  if (typeof path !== 'string') return false;
  if (!path.startsWith('/')) return false; // Must be a relative path
  if (path.startsWith('/api/')) return false; // Avoid API paths
  return path;
}
