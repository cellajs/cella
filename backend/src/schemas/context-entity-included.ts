import { z } from '@hono/zod-openapi';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { fullCountsSchema } from '#/schemas/count-schemas';

/**
 * Schema for optional included data on context entities (requested via include query param).
 * Provides a consistent shape for all context entity API responses.
 */
export const contextEntityIncludedSchema = z.object({
  membership: membershipBaseSchema.optional(),
  counts: fullCountsSchema.optional(),
});
