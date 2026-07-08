import { z } from '@hono/zod-openapi';
import { createSchemaFactory } from 'drizzle-orm/zod';

/**
 * Schema factory using @hono/zod-openapi's extended Zod instance.
 * Generated schemas support .openapi() and other extensions.
 */
export const { createInsertSchema, createSelectSchema, createUpdateSchema } = createSchemaFactory({
  zodInstance: z,
});
