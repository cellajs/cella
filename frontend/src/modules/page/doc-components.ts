import type { ComponentType } from 'react';

/** Page body modules by file path, in a module of their own so `content.ts` can accept a new glob without a reload. */
export const docComponentModules = import.meta.glob<ComponentType>('/src/content/docs/**/*.{md,mdx}', { import: 'default' });
