import { z } from '@hono/zod-openapi';
import type { MergePatch } from '#/utils/merge-patch';

/** The patch of one member: an object or a record patches its members, anything else is replaced whole. */
const memberPatch = (schema: z.core.$ZodType): z.ZodType => {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
  if (inner instanceof z.ZodObject) {
    const shape = Object.fromEntries(Object.entries(inner.shape).map(([key, member]) => [key, memberPatch(member).nullable().optional()]));
    const patch = z.object(shape);
    return inner.description ? patch.describe(inner.description) : patch;
  }
  if (inner instanceof z.ZodRecord) return z.partialRecord(inner.keyType, memberPatch(inner.valueType).nullable());
  if (inner instanceof z.ZodType) return inner;
  throw new Error('mergePatchSchema patches zod schemas built with the classic API');
};

/**
 * The JSON Merge Patch (RFC 7396) of an object or record schema, for a field an update merges with `applyMergePatch`:
 * every member optional, `null` to remove it, an object member a patch of its own. Arrays and scalars keep their
 * schema, since a patch replaces them whole.
 */
export const mergePatchSchema = <T extends z.ZodType<object>>(schema: T) =>
  // The patch is built member by member at runtime, so its type is stated from the schema it patches.
  memberPatch(schema) as z.ZodType<MergePatch<z.output<T>>>;
