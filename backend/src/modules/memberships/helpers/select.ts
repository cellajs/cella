import type { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import type { ContextEntityTypeIdFields, GeneratedColumn } from '#/db/types';
import type { membershipBaseSchema } from '#/modules/memberships/schema';

export type MembershipBaseModel = z.infer<typeof membershipBaseSchema>;

/** Add additional entity ID fields based on the context entity types, excluding 'organization' */
const additionalEntityIdFields = appConfig.contextEntityTypes
  .filter((e) => e !== 'organization')
  .reduce(
    (fields, entityType) => {
      const fieldName = appConfig.entityIdFields[entityType];
      // Ensure the field exists on the table
      if (Object.hasOwn(membershipsTable, fieldName)) fields[fieldName] = membershipsTable[fieldName];
      return fields;
    },
    {} as Record<Exclude<ContextEntityTypeIdFields, 'organizationId'>, GeneratedColumn>,
  );

/**
 * Select for membership summary to embed membership in an entity.
 */
export const membershipBaseSelect = {
  id: membershipsTable.id,
  role: membershipsTable.role,
  archived: membershipsTable.archived,
  muted: membershipsTable.muted,
  order: membershipsTable.order,
  contextType: membershipsTable.contextType,
  userId: membershipsTable.userId,
  organizationId: membershipsTable.organizationId,
  ...additionalEntityIdFields,
};

/**
 * Base query for selecting membership summary to embed membership in an entity.
 *
 * - Always selects from `membershipsTable` using the predefined `membershipBaseSelect` shape.
 *
 * This query is meant to be extended (e.g., with additional joins or filters)
 * wherever user data needs to be fetched consistently.
 */
export const membershipBaseQuery = () => db.select(membershipBaseSelect).from(membershipsTable);
