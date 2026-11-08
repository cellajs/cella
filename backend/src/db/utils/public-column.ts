import { boolean } from 'drizzle-orm/pg-core';

/**
 * Reversible, so a boolean: true opens the row to any actor, anonymous included, once the entity declares
 * `publicRead()`. Every channel and product has it. The row condition reads the row alone, so a product takes its home
 * channel's value at create and on a move (`resolvePlacement`), and a change of the channel's value rewrites the rows
 * homed there (`publicCascadeHandlers`).
 */
export const publicColumn = { public: boolean().notNull().default(false) };
