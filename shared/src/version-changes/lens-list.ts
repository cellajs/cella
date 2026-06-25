/**
 * Ordered, append-only lens list — the designated append point for schema evolution.
 *
 * APPEND-ONLY: never reorder or remove existing entries. Add new lenses at the
 * END, in date order. The 0-based index + 1 is the lens's global schema ordinal;
 * `currentSchemaVersion` (engine.ts) is the array length.
 *
 * The CI append-only guard freezes the dated lens module files; this file is the
 * mutable append point. See info/SCHEMA_EVOLUTION.md.
 */
import type { LensDefinition } from './define';

// ── Ordered lens modules (append new imports at the end) ──
// example:
//   import taskNameToTitle from './2026-07-01-task-name-to-title';

/** Frozen, date-ordered list of shipped lenses. Empty until the first breaking change ships. */
export const lenses: readonly LensDefinition[] = [
  // taskNameToTitle,
];
