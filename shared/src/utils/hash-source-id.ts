/**
 * Deterministic 5-character hash of a sourceId for HLC tie-breaking: djb2, base-36, fixed width.
 * Backend, frontend and bench share it so HLC generation matches.
 */
export function hashSourceId(sourceId: string): string {
  let hash = 0;
  for (let i = 0; i < sourceId.length; i++) {
    hash = ((hash << 5) - hash + sourceId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, '0').slice(0, 5);
}
