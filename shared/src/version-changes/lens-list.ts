import type { LensDefinition } from './define';

// ── Ordered lens modules (append new imports at the end) ──
// example:
//   import taskNameToTitle from './2026-07-01-task-name-to-title';

/**
 * Frozen, date-ordered list of shipped lenses. Append-only: never reorder or
 * remove entries; add new lenses at the end. Index + 1 is the lens's global
 * schema ordinal; `currentSchemaVersion` (engine.ts) is the array length.
 * Empty until the first breaking change ships.
 */
export const lenses: readonly LensDefinition[] = [
  // taskNameToTitle,
];
