import { z } from '@hono/zod-openapi';
import { getTableName, type InferSelectModel, type Table } from 'drizzle-orm';
import {
  type BuildRefine,
  type BuildSchema,
  type CreateSelectSchema,
  createSchemaFactory,
  type NoUnknownKeys,
} from 'drizzle-orm/zod';
import { type SecretColumnsOf, secretColumnsOf } from '#/db/secret-columns';

const factory = createSchemaFactory({ zodInstance: z });

export const { createInsertSchema, createUpdateSchema } = factory;

type Coerce = typeof factory extends { createSelectSchema: CreateSelectSchema<infer C> } ? C : never;
type Refine<T extends Table> = BuildRefine<T['_']['columns'], Coerce>;
type WithoutSecrets<T extends Table, TRefine extends Refine<T> | undefined> = z.ZodObject<
  Omit<BuildSchema<'select', T['_']['columns'], TRefine, Coerce>['shape'], SecretColumnsOf<T['_']['name']>>
>;

/**
 * Select schema minus the table's `secretColumns` (db/secret-columns.ts), so a response schema built on a table
 * can never carry its hash or secret: the omit is derived, not remembered per schema. A hand `.omit()` of such a
 * column is a type error, since the key is already gone. `refine` is drizzle-zod's per-column override.
 */
export function createSelectSchema<T extends Table>(table: T): WithoutSecrets<T, undefined>;
export function createSelectSchema<T extends Table, TRefine extends Refine<T>>(
  table: T,
  refine: NoUnknownKeys<TRefine, InferSelectModel<T>>,
): WithoutSecrets<T, TRefine>;
export function createSelectSchema(table: Table, refine?: unknown): z.ZodObject<z.ZodRawShape> {
  // The overloads above carry the types; inside, an untyped shape is all the omit needs.
  const build = factory.createSelectSchema as (table: Table, refine?: unknown) => z.ZodObject<z.ZodRawShape>;
  const schema = build(table, refine);
  const keys = secretColumnsOf(getTableName(table));
  if (keys.length === 0) return schema;
  const mask: Record<string, true> = Object.fromEntries(keys.map((key) => [key, true as const]));
  return schema.omit(mask);
}

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
