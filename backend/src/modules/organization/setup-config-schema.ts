import { z } from '@hono/zod-openapi';

/**
 * Wire schema for `organization.setupConfig`, wired into the organization response and update
 * contract in `organization-schema`.
 *
 * Cella ships an empty object (no setup payload); forks override this file to describe their own
 * setup config (e.g. `z.object({ primaryLabels: z.array(...) })`) so it validates on the wire and
 * flows into the generated SDK type.
 */
export const setupConfigSchema = z.object({});
