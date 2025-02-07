import type { ContextEntity, Entity } from 'config';
import { and, eq, inArray, max } from 'drizzle-orm';
import { db } from '#/db/db';
import { type InsertMembershipModel, type MembershipModel, membershipSelect, membershipsTable } from '#/db/schema/memberships';
import type { UserModel } from '#/db/schema/users';
import { entityIdFields, entityRelations } from '#/entity-config';
import type { EntityModel } from '#/lib/entity';
import { logEvent } from '#/middlewares/logger/log-event';

type BaseEntityModel<T extends Entity> = {
  id: string;
  entity: T;
  organizationId?: string;
};

interface Props<T> {
  user: UserModel;
  role: MembershipModel['role'];
  entity: T;
  createdBy?: UserModel['id'];
  tokenId?: string | null;
}

/**
 * Inserts a new membership for a user, assigning it the next available order number.
 * The membership can be linked to an entity and optionally to a parent entity.
 *
 * @param info.user - User to be added to membership.
 * @param info.role - Role of user within entity.
 * @param info.entity - Entity to which membership belongs.
 * @param info.createdBy - Optional, user who created membership (default: current user).
 * @param info.tokenId - Id of a token if it's and invite membership (default: null).
 * @returns The newly inserted membership record.
 */
export const insertMembership = async <T extends BaseEntityModel<ContextEntity>>({
  user,
  role,
  entity,
  createdBy = user.id,
  tokenId = null,
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
    tokenId,
    activatedAt: tokenId ? null : new Date(),
    order: maxOrder ? maxOrder + 1 : 1,
  };
  // If inserted membership is not organization
  newMembership.organizationId = entity.organizationId ?? entity.id;
  const entityIdField = entityIdFields[entity.entity];

  //TODO-entitymap map over entityIdFields

  // If you add more entities to membership
  newMembership[entityIdField] = entity.id;

  // Insert
  const [result] = await db.insert(membershipsTable).values(newMembership).returning(membershipSelect);

  // Log
  logEvent(`User added to ${entity.entity}`, { user: user.id, id: entity.id });

  return result;
};

/**
 * Activates a user's membership by clearing the associated token and setting the activation timestamp.
 * The membership is linked to a specific entity type and entity ID.
 *
 * @param userId - User ID whose membership is being activated.
 * @param entityType - Entity type associated with membership.
 * @param entityId - Entity ID where the membership exists.
 * @returns Updated membership.
 */
export const activateMembership = async (userId: string, entityType: ContextEntity, entityId: string) => {
  const entityIdField = entityIdFields[entityType];

  const [result] = await db
    .update(membershipsTable)
    .set({ tokenId: null, activatedAt: new Date() })
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable[entityIdField], entityId), eq(membershipsTable.type, entityType)));

  // Log
  logEvent(`User membership in ${result.entity} activated`, { user: result.userId, id: result[entityIdField] });

  return result;
};

export const getMembershipsByUserIds = (entityId: string, entityType: ContextEntity, userIds: string[]) => {
  const idField = entityIdFields[entityType];

  return db
    .select()
    .from(membershipsTable)
    .where(and(eq(membershipsTable[idField], entityId), eq(membershipsTable.type, entityType), inArray(membershipsTable.userId, userIds)));
};

export const getMainEntityDetails = <T extends ContextEntity>(entity: EntityModel<T>) => {
  const mainEntityRelation = entityRelations.find((el) => el.subEntity === entity.entity && el.dependentHierarchy);

  if (!mainEntityRelation) return { mainEntityType: null, mainEntityIdField: null, mainEntityId: null };

  const { entity: mainEntityType } = mainEntityRelation;
  const mainEntityIdField = entityIdFields[mainEntityType] ?? null;
  const mainEntityId = mainEntityIdField && mainEntityIdField in entity ? (entity[mainEntityIdField] as string) : null;

  return { mainEntityType, mainEntityIdField, mainEntityId };
};
