import { boolean } from 'drizzle-orm/pg-core';

/**
 * Reversible, so a boolean: true opens the row to any actor, anonymous included, once the entity declares
 * `publicRead()`. Every channel and product has it; a product copies its channel's value at create, because the row
 * condition reads the row alone.
 */
export const publicColumn = { public: boolean().notNull().default(false) };
