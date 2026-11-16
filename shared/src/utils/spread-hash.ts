/** FNV-1a 32-bit: the stable spread slot of a client and scope, which the frontend's fetch scheduler and bench share. */
export function hashSpread(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
