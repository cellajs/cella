import { appConfig } from 'config';
import { varchar } from 'drizzle-orm/pg-core';
import type { ContextEntityTypeColumns } from '#/db/types';
import { entityTables } from '#/entity-config';

/**
 * Helper function to generate fields dynamically based on `appConfig.contextEntityTypes`,
 * loops through and create references for each entity type, ensuring proper relational mapping.
 *
 * @returns A set of dynamically generated fields for context entities.
 */
export const generateContextEntityTypeFields = () =>
  appConfig.contextEntityTypes.reduce((fields, entityType) => {
    const fieldTable = entityTables[entityType]; // Retrieve associated table for entity
    const fieldName = appConfig.entityIdFields[entityType]; // Determine the entity's ID field name

    // Add the field with a foreign key reference, ensuring cascading deletion
    fields[fieldName] = varchar().references(() => fieldTable.id, { onDelete: 'cascade' });

    return fields;
  }, {} as ContextEntityTypeColumns);
