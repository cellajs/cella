import { config } from 'config';
import { type PgColumn, type PgVarcharBuilderInitial, boolean, doublePrecision, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { entityIdFields, entityTables } from '#/entity-config';
import type { ContextEntityIdFields } from '#/types/common';
import { nanoid } from '#/utils/nanoid';

const roleEnum = config.rolesByType.entityRoles;

export const membershipsTable = createDynamicMembershipTable();

// Create dynamic membership table
function createDynamicMembershipTable() {
  const { organizationId, ...rest } = generateDynamicFields();
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
    organizationId: organizationId.notNull(),
    ...rest,
  });
}

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
    {} as Record<Exclude<ContextEntityIdFields, 'organizationId'>, MembershipDynamicColumn>,
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

// Helper function for dynamic fields generation
function generateDynamicFields() {
  return config.contextEntityTypes.reduce(
    (fields, entityType) => {
      const fieldTable = entityTables[entityType];
      const fieldName = entityIdFields[entityType];
      // Add the dynamic field with optional constraints
      fields[fieldName] = varchar().references(() => fieldTable.id, { onDelete: 'cascade' });
      return fields;
    },
    {} as Record<ContextEntityIdFields, PgVarcharBuilderInitial<'', [string, ...string[]]>>,
  );
}
type MembershipDynamicColumn = PgColumn<{
  name: Exclude<ContextEntityIdFields, 'organizationId'>;
  tableName: 'memberships';
  dataType: 'string';
  columnType: 'PgVarchar';
  data: string;
  driverParam: string;
  notNull: false;
  hasDefault: false;
  isPrimaryKey: false;
  isAutoincrement: false;
  hasRuntimeDefault: false;
  enumValues: [string, ...string[]];
  baseColumn: never;
  generated: undefined;
}>;
export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
