import { config } from 'config';
import { boolean, doublePrecision, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { entityIdFields } from '#/entity-config';
import type { ContextEntityIdFields, DynamicColumn } from '#/types/common';
import { nanoid } from '#/utils/nanoid';
import { createDynamicTable, generateContextEntityDynamicFields } from './helpers';

const roleEnum = config.rolesByType.entityRoles;

const { organizationId, ...additionalColumns } = generateContextEntityDynamicFields();

const baseColumns = {
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
};

// Create dynamic membership table
export const membershipsTable = createDynamicTable('memberships', baseColumns, additionalColumns);

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

type MembershipDynamicColumn = Omit<DynamicColumn, 'name' | 'tableName'> & {
  name: Exclude<ContextEntityIdFields, 'organizationId'>;
  tableName: 'memberships';
};

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
