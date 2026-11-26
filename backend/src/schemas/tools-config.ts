import { z } from '@hono/zod-openapi';
import type { EntityHierarchy } from 'shared';
import { storableSlots } from 'shared/placements';
import { ltiTabId, type ToolsConfig } from 'shared/tools-config';
import { maxLength } from '#/db/utils/constraints';

// More than any slot holds: its tools, and the LTI tabs placed in the channel, whose ids alone the order names.
const toolIdsSchema = z.array(z.string().max(maxLength.field)).max(100);

const slotToolsConfigSchema = z.object({
  order: toolIdsSchema
    .describe(`Tool and tab ids in display order; in a tabs slot, \`${ltiTabId('{installationId}')}\` names an LTI tool's placed tab`)
    .optional(),
  hidden: toolIdsSchema
    .describe("Tool and tab ids the channel hides; an LTI tool's tab is switched off on its resource link, and its id here is ignored")
    .optional(),
});

/**
 * Wire schema for the per-slot tool arrangement a channel row of `entityType` stores. Keys are its storable slots, its
 * own and those of the channel types below it. A slot of a type above the row or beside it is refused at the wire and
 * never reaches the column. An id is any string: the client drops one that names no tool or tab when it arranges a slot.
 */
export const channelToolsConfigSchema = (entityType: string, entityHierarchy?: EntityHierarchy): z.ZodType<ToolsConfig> =>
  z.partialRecord(z.enum(storableSlots(entityType, entityHierarchy)), slotToolsConfigSchema);
