import type { ChannelEntityType } from 'shared';

/**
 * Extra fields for a channel's `counts` object in the included schema. App-owned: cella ships
 * none, apps add e.g. `milestones: z.object({...}).optional()` here, optional when only some ops
 * populate them. Keep the return a plain object literal (no ZodRawShape annotation) so the counts
 * schema keeps exact field inference for SDK generation.
 */
export const appChannelCountFields = (_entityType: ChannelEntityType) => ({});
