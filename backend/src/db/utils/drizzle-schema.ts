import { z } from '@hono/zod-openapi';
import { createSchemaFactory } from 'drizzle-orm/zod';

export const { createInsertSchema, createSelectSchema, createUpdateSchema } = createSchemaFactory({
  zodInstance: z,
});

export const describeFields = <T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  descriptions: Partial<Record<keyof T['shape'] & string, string>>,
): T => {
  // Zod v4 types `.shape` values as core `$ZodType`, which lacks `.describe`; at runtime the field is a full ZodType.
  const shape = schema.shape as Record<string, z.ZodType>;
  const patches: Record<string, z.ZodType> = {};
  for (const [key, text] of Object.entries(descriptions)) {
    if (text) patches[key] = shape[key].describe(text);
  }
  // `.extend()` widens to an index-signature shape, so restoring T needs a double cast; `.describe()` changes no types.
  return schema.extend(patches) as unknown as T;
};
