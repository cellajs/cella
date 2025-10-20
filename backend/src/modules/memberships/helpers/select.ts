import type { z } from '@hono/zod-openapi';
import { getTableColumns } from 'drizzle-orm/utils';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { pickColumns } from '#/db/utils/pick-columns';
import { membershipBaseSchema } from '#/modules/memberships/schema';

export type MembershipBaseModel = z.infer<typeof membershipBaseSchema>;

// Infer types of membership base columns
type TableColumns = (typeof membershipsTable)['_']['columns'];
type MembershipBaseKeys = keyof typeof membershipBaseSchema.shape;
type MembershipBaseSelect = Pick<TableColumns, MembershipBaseKeys>;

/**
 * Membership select for base data only.
 */
export const membershipBaseSelect = (() => {
  const cols = getTableColumns(membershipsTable) satisfies TableColumns;
  const keys = Object.keys(membershipBaseSchema.shape) as MembershipBaseKeys[];
  return pickColumns(cols, keys);
})() satisfies MembershipBaseSelect;

// TODO remove not a pattern I like
/**
 * Base query for selecting membership summary to embed membership in an entity.
 *
 * - Always selects from `membershipsTable` using the predefined `membershipBaseSelect` shape.
 *
 * This query is meant to be extended (e.g., with additional joins or filters)
 * wherever user data needs to be fetched consistently.
 */
export const membershipBaseQuery = () => db.select(membershipBaseSelect).from(membershipsTable);
