import { z } from '@hono/zod-openapi';
import { createSchemaFactory } from 'drizzle-orm/zod';

/**
 * Schema factory using @hono/zod-openapi's extended Zod instance.
 * Generated schemas support .openapi() and other extensions.
 */
export const { createInsertSchema, createSelectSchema, createUpdateSchema } = createSchemaFactory({
  zodInstance: z,
});

/**
 * Attaches OpenAPI descriptions to named fields of a generated schema, preserving each field's type.
 * Fields are re-wrapped with `.describe()`; the returned schema keeps its input type. The `as T` cast
 * bridges a drizzle-zod generics gap: it cannot infer the exact object type back through a dynamic key map,
 * and `.describe()` changes neither the runtime nor the inferred field types.
 */
export const describeFields = <T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  descriptions: Partial<Record<keyof T['shape'] & string, string>>,
): T => {
  // Zod v4 types `.shape` values as the core `$ZodType`, which lacks the fluent `.describe`; the field is a full ZodType at runtime.
  const shape = schema.shape as Record<string, z.ZodType>;
  const patches: Record<string, z.ZodType> = {};
  for (const [key, text] of Object.entries(descriptions)) {
    if (text) patches[key] = shape[key].describe(text);
  }
  // Library type gap: `.extend()` widens to an index-signature shape, so restoring T needs a double cast.
  // `.describe()` alters neither the runtime schema nor the inferred field types, so the input type still holds.
  return schema.extend(patches) as unknown as T;
};
