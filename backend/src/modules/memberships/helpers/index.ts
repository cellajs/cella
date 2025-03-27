import type { ContextEntity } from 'config';
import { eq, max } from 'drizzle-orm';
import { db } from '#/db/db';
import { type MembershipModel, membershipsTable } from '#/db/schema/memberships';
import { entityIdFields, entityRelations } from '#/entity-config';
import type { EntityModel } from '#/lib/entity';
import { logEvent } from '#/middlewares/logger/log-event';
import { membershipSelect } from '#/modules/memberships/helpers/select';
import { getIsoDate } from '#/utils/iso-date';

type BaseEntityModel = EntityModel<ContextEntity> & {
  organizationId?: string;
};

interface Props<T> {
  userId: string;
  role: MembershipModel['role'];
  entity: T;
  createdBy?: string;
  tokenId?: string | null;
  addAssociatedMembership?: boolean;
  addOrganizationMembership?: boolean;
}

/**
 * Inserts a new membership for a user, linking user to both target entity
 * and its associated entity (if applicable). Function calculates
 * next available order number and handles token-based memberships.
 *
 * @param info.userId - user ID to be added to membership.
 * @param info.role - Role of user within entity.
 * @param info.entity - Entity to which membership belongs.
 * @param info.createdBy - Optional, user who created membership (default: current user).
 * @param info.tokenId - Optional, Id of a token if it's and invite membership (default: null).
 * @param info.addAssociatedMembership - Optional, boolean flag whether to check and add user to an associated entity of target entity (default: true)
 * * @param info.addOrganizationMembership - Optional, boolean flag whether to check and add user to an organization entity of target entity (default: true)
 * @returns Inserted target membership.
 */
export const insertMembership = async <T extends BaseEntityModel>({
  userId,
  role,
  entity,
  createdBy = userId,
  tokenId = null,
  addAssociatedMembership = true,
  addOrganizationMembership = true,
}: Props<T>) => {
  // Get max order number
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(membershipsTable.order) })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId));

  const entityIdField = entityIdFields[entity.entity];
  const { associatedEntityType, associatedEntityIdField, associatedEntityId } = getAssociatedEntityDetails(entity);

  const baseMembership = {
    organizationId: entity.organizationId ?? entity.id,
    userId,
    role,
    createdBy,
    tokenId,
    activatedAt: tokenId ? null : getIsoDate(),
    order: maxOrder ? maxOrder + 1 : 1,
  };

  // Insert organization membership first
  if (addOrganizationMembership && entity.entity !== 'organization') {
    await db
      .insert(membershipsTable)
      .values({ ...baseMembership, type: 'organization' })
      .onConflictDoNothing(); // Do nothing if already exist
  }

  // Insert associated entity membership first (if applicable)
  if (addAssociatedMembership && associatedEntityId && associatedEntityType) {
    await db
      .insert(membershipsTable)
      .values({
        ...baseMembership,
        type: associatedEntityType,
        [associatedEntityIdField]: associatedEntityId,
      })
      .onConflictDoNothing(); // Do nothing if already exist
  }

  // Insert target entity membership
  const [result] = await db
    .insert(membershipsTable)
    .values({
      ...baseMembership,
      type: entity.entity,
      ...(entity.entity !== 'organization' && { [entityIdField]: entity.id }),
      ...(associatedEntityId && associatedEntityIdField && { [associatedEntityIdField]: associatedEntityId }),
    })
    .returning(membershipSelect);

  logEvent(`User added to ${entity.entity}`, { user: userId, id: entity.id }); // Log event

  return result;
};

export const getAssociatedEntityDetails = <T extends ContextEntity>(entity: EntityModel<T>) => {
  const associatedEntityRelation = entityRelations.find((el) => el.subEntity === entity.entity && el.dependentHierarchy);

  if (!associatedEntityRelation) return { associatedEntityType: null, associatedEntityIdField: null, associatedEntityId: null };

  const { entity: associatedEntityType } = associatedEntityRelation;
  const associatedEntityIdField = entityIdFields[associatedEntityType] ?? null;
  const associatedEntityId =
    associatedEntityIdField && associatedEntityIdField in entity ? (entity[associatedEntityIdField as keyof typeof entity] as string) : null;

  return { associatedEntityType, associatedEntityIdField, associatedEntityId };
};
