import { z } from '@hono/zod-openapi';

/**
 * Wire schema for `organization.setupConfig`, used by the organization response and update contract.
 * The template ships an empty object; apps override this file so their setup config validates on the wire and reaches the SDK type.
 */
export const setupConfigSchema = z.object({});
