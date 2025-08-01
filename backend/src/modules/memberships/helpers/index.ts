import { appConfig, type ContextEntityType } from 'config';
import { and, eq, max } from 'drizzle-orm';
import { db } from '#/db/db';
import { type MembershipModel, membershipsTable } from '#/db/schema/memberships';
import type { EntityModel } from '#/lib/entity';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

type BaseEntityModel = EntityModel<ContextEntityType> & {
  organizationId?: string;
};

interface Props<T> {
  userId: string;
  role: MembershipModel['role'];
  entity: T;
  createdBy?: string;
  tokenId?: string | null;
  addAssociatedMembership?: boolean;
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
 * @returns Inserted target membership.
 */
export const insertMembership = async <T extends BaseEntityModel>({
  userId,
  role,
  entity,
  createdBy = userId,
  tokenId = null,
  addAssociatedMembership = true,
}: Props<T>) => {
  // Get max order number
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(membershipsTable.order) })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId));

  const entityIdField = appConfig.entityIdFields[entity.entityType];
  const associatedEntity = getAssociatedEntityDetails(entity);

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
  if (entity.entityType !== 'organization') {
    const hasOrgMembership = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, userId),
          eq(membershipsTable.contextType, 'organization'),
          eq(membershipsTable.organizationId, baseMembership.organizationId),
        ),
      );

    if (!hasOrgMembership.length)
      await db
        .insert(membershipsTable)
        .values({ ...baseMembership, contextType: 'organization' })
        .onConflictDoNothing();
  }

  // Insert associated entity membership first (if applicable)
  if (addAssociatedMembership && associatedEntity) {
    await db
      .insert(membershipsTable)
      .values({
        ...baseMembership,
        contextType: associatedEntity.type,
        [associatedEntity.field]: associatedEntity.id,
      })
      .onConflictDoNothing(); // Do nothing if already exist
  }

  // Insert target entity membership
  const [result] = await db
    .insert(membershipsTable)
    .values({
      ...baseMembership,
      contextType: entity.entityType,
      ...(entity.entityType !== 'organization' && { [entityIdField]: entity.id }),
      ...(associatedEntity && { [associatedEntity.field]: associatedEntity.id }),
    })
    .returning(membershipSummarySelect);

  logEvent({ msg: `User added to ${entity.entityType}`, meta: { user: userId, id: entity.id } }); // Log event

  return result;
};

export const getAssociatedEntityDetails = <T extends ContextEntityType>(entity: EntityModel<T>) => {
  const relation = appConfig.menuStructure.find((rel) => rel.subentityType === entity.entityType);
  if (!relation) return null;
  const type = relation.entityType;
  const field = appConfig.entityIdFields[type] ?? null;
  if (!field || !(field in entity)) return null;

  const id = entity[field as keyof typeof entity] as string;
  return { id, type, field };
};
