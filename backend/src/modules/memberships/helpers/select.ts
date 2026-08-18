import type { z } from '@hono/zod-openapi';
import { getColumns } from 'drizzle-orm';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { pick } from '#/utils/pick';

export type MembershipBaseModel = z.infer<typeof membershipBaseSchema>;

type TableColumns = (typeof membershipsTable)['_']['columns'];
type MembershipBaseKeys = keyof typeof membershipBaseSchema.shape;
type MembershipBaseSelect = Pick<TableColumns, MembershipBaseKeys>;

const membershipBaseKeys = Object.keys(membershipBaseSchema.shape) as MembershipBaseKeys[];

export const membershipBaseSelect: MembershipBaseSelect = (() => {
  const cols = getColumns(membershipsTable);
  return pick(cols, membershipBaseKeys);
})();

/** Schema-driven, so apps with extra channel entity ID columns (workspaceId, projectId) are handled automatically. */
export const toMembershipBase = (membership: Record<string, unknown>): MembershipBaseModel => {
  const result = {} as Record<string, unknown>;
  for (const key of membershipBaseKeys) {
    if (key in membership) result[key] = membership[key];
  }
  return result as MembershipBaseModel;
};
