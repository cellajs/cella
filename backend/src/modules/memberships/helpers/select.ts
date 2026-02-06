import type { z } from '@hono/zod-openapi';
import { getColumns } from 'drizzle-orm';
import { membershipsTable } from '#/db/schema/memberships';
import { pickColumns } from '#/db/utils/pick-columns';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';

export type MembershipBaseModel = z.infer<typeof membershipBaseSchema>;

// Infer types of membership base columns
type TableColumns = (typeof membershipsTable)['_']['columns'];
type MembershipBaseKeys = keyof typeof membershipBaseSchema.shape;
type MembershipBaseSelect = Pick<TableColumns, MembershipBaseKeys>;

/**
 * Membership select for base data only.
 */
export const membershipBaseSelect: MembershipBaseSelect = (() => {
  const cols = getColumns(membershipsTable);
  const keys = Object.keys(membershipBaseSchema.shape) as MembershipBaseKeys[];
  return pickColumns(cols, keys);
})();
