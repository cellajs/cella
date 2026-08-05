import { type Column, sql } from 'drizzle-orm';

/**
 * Shallow jsonb merge for partial updates: `column || value`, so each top-level key in `value`
 * replaces the stored key wholesale and unlisted keys survive. The update convention for sparse
 * config columns (`organizationFlags`, `setupConfig`, per-channel `toolsConfig`).
 */
export const mergeJsonbShallow = (col: Column, value: object) => sql`${col} || ${JSON.stringify(value)}::jsonb`;
