/** Scalar-like operation hash, formatted tag/{tagName}/{METHOD}{path}. */
export function generateOperationHash(method: string, path: string, tags: string[]): string {
  const tag = tags[0] || 'default';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `tag/${tag}/${method.toUpperCase()}/${cleanPath}`;
}
