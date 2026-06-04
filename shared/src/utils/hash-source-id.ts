/**
 * Deterministic 5-char hash of a sourceId for HLC tie-breaking.
 * Uses djb2 hashing → base-36 encoding → fixed-width 5-char output.
 *
 * Shared between backend, frontend, and bench to ensure consistent HLC generation.
 */
export function hashSourceId(sourceId: string): string {
  let hash = 0;
  for (let i = 0; i < sourceId.length; i++) {
    hash = ((hash << 5) - hash + sourceId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, '0').slice(0, 5);
}
