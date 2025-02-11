import { config } from 'config';
import { membershipsTable } from '#/db/schema/memberships';
import type { GeneratedColumn } from '#/db/types';
import { type ContextEntityIdFields, entityIdFields } from '#/entity-config';

// Dynamic part of the select based on contextEntityTypes that you can set in config
const membershipDynamicSelect = config.contextEntityTypes
  .filter((e) => e !== 'organization')
  .reduce(
    (fields, entityType) => {
      const fieldName = entityIdFields[entityType];
      // Ensure the field exists on the table
      if (Object.prototype.hasOwnProperty.call(membershipsTable, fieldName)) fields[fieldName] = membershipsTable[fieldName];
      return fields;
    },
    {} as Record<Exclude<ContextEntityIdFields, 'organizationId'>, GeneratedColumn>,
  );

// Merge the static and dynamic select fields
export const membershipSelect = {
  id: membershipsTable.id,
  role: membershipsTable.role,
  archived: membershipsTable.archived,
  muted: membershipsTable.muted,
  order: membershipsTable.order,
  type: membershipsTable.type,
  userId: membershipsTable.userId,
  organizationId: membershipsTable.organizationId,
  ...membershipDynamicSelect,
};
