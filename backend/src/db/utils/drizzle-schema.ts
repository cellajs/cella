/**
 * Drizzle schema utilities for use with @hono/zod-openapi
 *
 * Uses createSchemaFactory to generate Zod schemas that are compatible
 * with the extended Zod instance from @hono/zod-openapi.
 */

import { z } from '@hono/zod-openapi';
import { createSchemaFactory } from 'drizzle-orm/zod';

/**
 * Schema factory using @hono/zod-openapi's extended Zod instance.
 * This ensures generated schemas support .openapi() and other extensions.
 */
export const { createInsertSchema, createSelectSchema, createUpdateSchema } = createSchemaFactory({
  zodInstance: z,
});
