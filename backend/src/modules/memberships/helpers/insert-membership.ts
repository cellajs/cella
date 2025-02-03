import { eq, max } from 'drizzle-orm';
import { db } from '#/db/db';
import { type InsertMembershipModel, type MembershipModel, membershipSelect, membershipsTable } from '#/db/schema/memberships';
import type { UserModel } from '#/db/schema/users';
import { entityIdFields } from '#/entity-config';
import { logEvent } from '#/middlewares/logger/log-event';
import type { BaseEntityModel, ContextEntity } from '#/types/common';

interface Props<T> {
  user: UserModel;
  role: MembershipModel['role'];
  entity: T;
  parentEntity?: {
    entity: ContextEntity;
    id: string;
  } | null;
  createdBy?: UserModel['id'];
}

/**
 * Inserts a new membership for a user, assigning it the next available order number.
 * The membership can be linked to an entity and optionally to a parent entity.
 *
 * @param user - User to be added to the membership.
 * @param role - Role of user within the entity.
 * @param entity - Entity to which membership belongs.
 * @param parentEntity - Parent entity of membership, if applicable.
 * @param createdBy - The user who created the membership (defaults to the current user).
 * @returns The newly inserted membership record.
 */
export const insertMembership = async <T extends BaseEntityModel<ContextEntity>>({
  user,
  role,
  entity,
  parentEntity,
  createdBy = user.id,
}: Props<T>) => {
  // Get the max order number
  const [{ maxOrder }] = await db
    .select({
      maxOrder: max(membershipsTable.order),
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, user.id));

  const newMembership: InsertMembershipModel = {
    organizationId: '',
    type: entity.entity,
    userId: user.id,
    role,
    createdBy,
    order: maxOrder ? maxOrder + 1 : 1,
  };
  // If inserted membership is not organization
  newMembership.organizationId = entity.organizationId ?? entity.id;
  const entityIdField = entityIdFields[entity.entity];

  if (parentEntity) {
    const idFieldKey = entityIdFields[parentEntity.entity];
    newMembership[idFieldKey] = parentEntity.id;
  }

  // If you add more entities to membership
  newMembership[entityIdField] = entity.id;

  // Insert
  const [result] = await db.insert(membershipsTable).values(newMembership).returning(membershipSelect);

  // Log
  logEvent(`User added to ${entity.entity}`, { user: user.id, id: entity.id });

  return result;
};
