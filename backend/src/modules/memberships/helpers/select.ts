import type { z } from '@hono/zod-openapi';
import { config } from 'config';
import { membershipsTable } from '#/db/schema/memberships';
import type { ContextEntityTypeIdFields, GeneratedColumn } from '#/db/types';
import type { membershipSummarySchema } from '#/modules/memberships/schema';

export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

/** Add additional entity ID fields based on the context entity types, excluding 'organization' */
const additionalEntityIdFields = config.contextEntityTypes
  .filter((e) => e !== 'organization')
  .reduce(
    (fields, entityType) => {
      const fieldName = config.entityIdFields[entityType];
      // Ensure the field exists on the table
      if (Object.hasOwn(membershipsTable, fieldName)) fields[fieldName] = membershipsTable[fieldName];
      return fields;
    },
    {} as Record<Exclude<ContextEntityTypeIdFields, 'organizationId'>, GeneratedColumn>,
  );

/**
 * Select for membership summary to embed membership in an entity.
 */
export const membershipSummarySelect = {
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
