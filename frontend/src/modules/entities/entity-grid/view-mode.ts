import z from 'zod';

const entityViewModes = ['grid', 'table'] as const;

export type EntityViewMode = (typeof entityViewModes)[number];

/** The `view` search param of a channel list shown as tiles or as a table; add `view: 'grid'` to the route's stripped defaults. */
export const entityViewSearchParam = z.enum(entityViewModes).default('grid').catch('grid');
