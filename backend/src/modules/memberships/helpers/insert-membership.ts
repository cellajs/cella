import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { type MembershipModel, membershipsTable } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { UserModel } from '#/db/schema/users';
import { logEvent } from '#/middlewares/logger/log-event';

// TODO:generics issue
interface Props {
  user: UserModel;
  role: MembershipModel['role'];
  entity: OrganizationModel;
  createdBy?: UserModel['id'];
  memberships?: MembershipModel[];
}

// TODO:generics issue. Helper function to insert a membership and give it proper order number
export const insertMembership = async ({ user, role, entity, createdBy = user.id, memberships }: Props) => {
  const organizationId = entity.id;

  const newMembership = {
    organizationId,
    type: entity.entity,
    userId: user.id,
    role,
    createdBy,
    order: 1,
  };

  // Get user memberships
  let userMemberships = memberships;

  if (!memberships) {
    userMemberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));
  }

  // Set order based on existing memberships for given entity type
  if (userMemberships?.length) {
    const membershipMaxOrder = userMemberships.reduce((max, current) => {
      if (current.type === entity.entity && (!max || current.order > max.order)) return current;
      return max;
    });

    newMembership.order = membershipMaxOrder.order + 1;
  }

  // Insert
  // TODO y can't use partial returning
  const [results] = await db.insert(membershipsTable).values(newMembership).returning();
  // Log
  logEvent(`User added to ${entity.entity}`, { user: user.id, id: entity.id });
  return {
    id: results.id,
    role: results.role,
    archived: results.archived,
    muted: results.muted,
    order: results.order,
    userId: results.userId,
    organizationId: results.organizationId,
  };
};
