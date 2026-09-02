import { z } from '@hono/zod-openapi';
import type { ChannelEntityType } from 'shared';

/**
 * App-owned fields on template wire schemas (pinned). The template ships empty shapes; apps fill
 * them here so their data validates on the wire and reaches the SDK types without editing the
 * template schema files that spread them.
 */

/** Wire schema for `organization.setupConfig`, spread into the organization response and update contract. */
export const setupConfigSchema = z.object({});

/**
 * Extra fields for a channel's `counts` object in the included schema, e.g.
 * `milestones: z.object({...}).optional()`, optional when only some operations populate them. Keep
 * the return a plain object literal (no ZodRawShape annotation) so the counts schema keeps exact
 * field inference for SDK generation.
 */
export const appChannelCountFields = (_entityType: ChannelEntityType) => ({});
