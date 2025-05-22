import { config } from 'config';
import type { z } from 'zod';
import { membershipsTable } from '#/db/schema/memberships';
import type { ContextEntityTypeIdFields, GeneratedColumn } from '#/db/types';
import type { membershipSummarySchema } from '../schema';

export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

// Dynamic part of the select based on contextEntities that you can set in config
const membershipDynamicSelect = config.contextEntityTypes
  .filter((e) => e !== 'organization')
  .reduce(
    (fields, entityType) => {
      const fieldName = config.entityIdFields[entityType];
      // Ensure the field exists on the table
      if (Object.prototype.hasOwnProperty.call(membershipsTable, fieldName)) fields[fieldName] = membershipsTable[fieldName];
      return fields;
    },
    {} as Record<Exclude<ContextEntityTypeIdFields, 'organizationId'>, GeneratedColumn>,
  );

// Merge the static and dynamic select fields
// TODO cant we derive this from the table schema?
export const membershipSelect = {
  id: membershipsTable.id,
  role: membershipsTable.role,
  archived: membershipsTable.archived,
  muted: membershipsTable.muted,
  order: membershipsTable.order,
  contextType: membershipsTable.contextType,
  userId: membershipsTable.userId,
  organizationId: membershipsTable.organizationId,
  ...membershipDynamicSelect,
};
