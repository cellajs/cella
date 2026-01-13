/**
 * Utilities for OpenAPI documentation generation.
 */

/**
 * Generate a Scalar-like hash for an operation.
 * Format: tag/{tagName}/{METHOD}{path}
 * Example: tag/system/POST/system/paddle-webhook
 */
export function generateOperationHash(method: string, path: string, tags: string[]): string {
  const tag = tags[0] || 'default';
  // Remove leading slash and convert path for hash
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `tag/${tag}/${method.toUpperCase()}/${cleanPath}`;
}
