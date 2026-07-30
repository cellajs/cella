import { z } from '@hono/zod-openapi';
import type { ToolsConfig } from 'shared/tools-config';

/** Wire schema for a channel's per-slot tool arrangement (see `shared/tools-config` for the contract). */
export const toolsConfigSchema: z.ZodType<ToolsConfig> = z.record(
  z.string(),
  z.object({
    order: z.array(z.string()).optional(),
    hidden: z.array(z.string()).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),
);
