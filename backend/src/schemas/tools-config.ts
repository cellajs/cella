import { z } from '@hono/zod-openapi';
import { channelSlots } from 'shared/placements';
import { ltiTabId, type ToolsConfig } from 'shared/tools-config';
import { maxLength } from '#/db/utils/constraints';

const slots = channelSlots();

// More than any slot holds: its tools, and the LTI tabs placed in the channel, whose ids alone the order names.
const toolIdsSchema = z.array(z.string().max(maxLength.field)).max(100);

/**
 * Wire schema for a channel's per-slot tool arrangement. Keys are validated against this app's channel slots, so one
 * that belongs to no channel is refused at the wire and never reaches the column. An id is any string: the client
 * drops one that names no tool or tab when it arranges a slot.
 */
export const toolsConfigSchema: z.ZodType<ToolsConfig> = z.partialRecord(
  z.enum(slots),
  z.object({
    order: toolIdsSchema
      .describe(`Tool and tab ids in display order; in a tabs slot, \`${ltiTabId('{installationId}')}\` names an LTI tool's placed tab`)
      .optional(),
    hidden: toolIdsSchema
      .describe("Tool and tab ids the channel hides; an LTI tool's tab is switched off on its resource link, and its id here is ignored")
      .optional(),
  }),
);
