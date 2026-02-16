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

const membershipBaseKeys = Object.keys(membershipBaseSchema.shape) as MembershipBaseKeys[];

/**
 * Membership select for base data only.
 */
export const membershipBaseSelect: MembershipBaseSelect = (() => {
  const cols = getColumns(membershipsTable);
  return pickColumns(cols, membershipBaseKeys);
})();

/**
 * Pick only the base membership fields from a full membership object.
 * This is schema-driven so forks with extra context entity ID columns
 * (e.g. workspaceId, projectId) are handled automatically.
 */
export const toMembershipBase = (membership: Record<string, unknown>): MembershipBaseModel => {
  const result = {} as Record<string, unknown>;
  for (const key of membershipBaseKeys) {
    if (key in membership) result[key] = membership[key];
  }
  return result as MembershipBaseModel;
};
