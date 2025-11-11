/**
 * Validate base path for redirects. If its valid, it returns the path.
 */
export function isValidRedirectPath(path: unknown) {
  if (typeof path !== 'string') return false;

  // Decode URI component safely
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return false; // Invalid encoding
  }

  // Must start with a forward slash (relative path)
  if (!decodedPath.startsWith('/')) return false;
  if (path.startsWith('/api/')) return false; // Avoid API paths
  return path;
}
