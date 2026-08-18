import type { LensDefinition } from './define.ts';

/**
 * Date-ordered shipped lenses, append-only: never reorder or remove an entry, add new lens
 * modules at the end. Index + 1 is a lens's global schema ordinal, and `currentSchemaVersion`
 * in engine.ts is the array length. Example entry:
 * `import taskNameToTitle from './2026-07-01-task-name-to-title';`
 */
export const lenses: readonly LensDefinition[] = [
  // taskNameToTitle,
];
