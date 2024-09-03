import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { type MembershipModel, membershipsTable } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { ProjectModel } from '#/db/schema/projects';
import type { UserModel } from '#/db/schema/users';
import type { WorkspaceModel } from '#/db/schema/workspaces';
import { logEvent } from '#/middlewares/logger/log-event';

interface Props {
  user: UserModel;
  role: MembershipModel['role'];
  entity: OrganizationModel | WorkspaceModel | ProjectModel;
  createdBy?: UserModel['id'];
  memberships?: MembershipModel[];
}

// Helper function to insert a membership and give it proper order number
export const insertMembership = async ({ user, role, entity, createdBy = user.id, memberships }: Props) => {
  const organizationId = entity.entity === 'organization' ? entity.id : entity.organizationId;

  const newMembership = {
    organizationId,
    workspaceId: null as string | null,
    projectId: null as string | null,
    type: entity.entity,
    userId: user.id,
    role,
    createdBy,
    order: 1,
  };

  // Set workspaceId or projectId if entity is workspace or project
  if (entity.entity === 'workspace') newMembership.workspaceId = entity.id;
  else if (entity.entity === 'project') newMembership.projectId = entity.id;

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
  const results = await db.insert(membershipsTable).values(newMembership).returning();

  // Log
  logEvent(`User added to ${entity.entity}`, { user: user.id, id: entity.id });

  return results;
};
