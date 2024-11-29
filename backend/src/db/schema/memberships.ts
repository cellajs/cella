import { config } from 'config';
import { type PgColumn, boolean, doublePrecision, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { entityIdFields, entityTables } from '#/entity-config';
import type { ContextEntityIdFields } from '#/types/common';
import { nanoid } from '#/utils/nanoid';

const roleEnum = config.rolesByType.entityRoles;

export const membershipsTable = createDynamicMembershipTable();

// Create dynamic membership table
function createDynamicMembershipTable() {
  const dynamicFields = generateDynamicFields();
  return pgTable('memberships', {
    id: varchar().primaryKey().$defaultFn(nanoid),
    type: varchar({ enum: config.contextEntityTypes }).notNull(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    createdAt: timestamp().defaultNow().notNull(),
    createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
    modifiedAt: timestamp(),
    modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
    archived: boolean().default(false).notNull(),
    muted: boolean().default(false).notNull(),
    order: doublePrecision().notNull(),
    ...dynamicFields,
  });
}

// Dynamic part of the select based on contextEntityTypes that you can set in config
const membershipDynamicSelect = config.contextEntityTypes.reduce(
  (fields, entityType) => {
    const fieldName = entityIdFields[entityType];
    // Ensure the field exists on the table
    if (Object.prototype.hasOwnProperty.call(membershipsTable, fieldName)) fields[fieldName] = membershipsTable[fieldName];
    return fields;
  },
  {} as Record<ContextEntityIdFields, PgColumn>,
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
  ...membershipDynamicSelect,
};

// Helper function for dynamic fields generation
function generateDynamicFields() {
  return config.contextEntityTypes.reduce(
    (fields, entityType) => {
      const fieldTable = entityTables[entityType];
      const fieldName = entityIdFields[entityType];
      // Add the dynamic field with optional constraints
      fields[fieldName] = varchar().references(() => fieldTable.id, { onDelete: 'cascade' });

      // Make 'organization' fields non-nullable
      if (entityType === 'organization') fields[fieldName] = fields[fieldName].notNull();

      return fields;
    },
    {} as Record<ContextEntityIdFields, ReturnType<typeof varchar>>,
  );
}

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
