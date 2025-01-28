import { config } from 'config';
import { type SQL, and, eq } from 'drizzle-orm';
import { type PgColumnBuilderBase, pgTable, varchar } from 'drizzle-orm/pg-core';
import { entityIdFields, entityTables } from '#/entity-config';
import type { ContextEntityColumns } from '#/types/common';
import { db } from './db';
import { type LimitedUserModel, type UnsafeUserModel, type UserModel, baseLimitedUserSelect, safeUserSelect, usersTable } from './schema/users';

type SafeQuery = typeof safeUserSelect;
type UnsafeQuery = typeof usersTable;

type SafeField = Extract<keyof SafeQuery, keyof SafeQuery['_']['columns']>;
type UnsafeField = Extract<keyof UnsafeQuery, keyof UnsafeQuery['_']['columns']>;

// Overload signatures
export function getUserBy(field: SafeField, value: string): Promise<UserModel | null>;
export function getUserBy(field: UnsafeField, value: string, type: 'unsafe'): Promise<UnsafeUserModel | null>;

// Implementation
export async function getUserBy(field: SafeField | UnsafeField, value: string, type?: 'unsafe'): Promise<UserModel | UnsafeUserModel | null> {
  const select = type === 'unsafe' ? usersTable : safeUserSelect;

  // Execute a database query to select the user based on the given field and value.
  const [result] = await db.select({ user: select }).from(usersTable).where(eq(usersTable[field], value));

  return result?.user ?? null;
}

// Overload signatures
export function getUsersByConditions(whereArray: (SQL<unknown> | undefined)[]): Promise<UserModel[]>;
export function getUsersByConditions(whereArray: (SQL<unknown> | undefined)[], type: 'unsafe'): Promise<UnsafeUserModel[]>;
export function getUsersByConditions(whereArray: (SQL<unknown> | undefined)[], type: 'limited'): Promise<LimitedUserModel[]>;

// Implementation
export async function getUsersByConditions(
  whereArray: (SQL<unknown> | undefined)[],
  type?: 'unsafe' | 'limited',
): Promise<UserModel[] | UnsafeUserModel[] | LimitedUserModel[]> {
  const select = getSelect(type);

  // Execute a database query to select users based on the conditions in 'whereArray'.
  const result = await db
    .select({ user: select })
    .from(usersTable)
    .where(and(...whereArray));

  return result.map((el) => el.user);
}

// Helper function to determine the select value
function getSelect(type?: 'unsafe' | 'limited') {
  if (type === 'unsafe') return usersTable;
  if (type === 'limited') return baseLimitedUserSelect;
  return safeUserSelect;
}

// Create dynamic table with type-safe columns
export const createDynamicTable = <
  TBaseColumns extends Record<string, PgColumnBuilderBase>,
  TAdditionalColumns extends Record<string, PgColumnBuilderBase>,
>(
  tableName: string,
  baseColumns: TBaseColumns,
  additionalColumns: TAdditionalColumns,
) =>
  pgTable(tableName, {
    ...baseColumns,
    ...additionalColumns,
  });

// Helper function for dynamic fields generation based of context entities
export const generateContextEntityDynamicFields = () =>
  config.contextEntityTypes.reduce((fields, entityType) => {
    const fieldTable = entityTables[entityType];
    const fieldName = entityIdFields[entityType];
    // Add the dynamic field with optional constraints
    fields[fieldName] = varchar().references(() => fieldTable.id, { onDelete: 'cascade' });
    return fields;
  }, {} as ContextEntityColumns);
