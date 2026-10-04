import { z } from '@hono/zod-openapi';
import { channelSlots } from 'shared/placements';
import type { ToolsConfig } from 'shared/tools-config';

const slots = channelSlots();

/**
 * Wire schema for a channel's per-slot tool arrangement (see `shared/tools-config` for the
 * contract). Keys are validated against this app's channel slots, so one that belongs to no channel
 * is refused at the wire and never reaches the column.
 */
export const toolsConfigSchema: z.ZodType<ToolsConfig> = z.partialRecord(
  z.enum(slots as [string, ...string[]]),
  z.object({ order: z.array(z.string()).optional(), hidden: z.array(z.string()).optional() }),
) as unknown as z.ZodType<ToolsConfig>;
