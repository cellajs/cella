import { eq } from 'drizzle-orm';
import { db } from './db';
import { type UnsafeUserModel, type UserModel, safeUserSelect, usersTable } from './schema/users';

type SafeQuery = typeof safeUserSelect;
type UnsafeQuery = typeof usersTable;
type Query = SafeQuery | UnsafeQuery;

type SafeField = Extract<keyof SafeQuery, keyof SafeQuery['_']['columns']>;
type UnsafeField = Extract<keyof UnsafeQuery, keyof UnsafeQuery['_']['columns']>;
type Field = Extract<keyof Query, keyof Query['_']['columns']>;

// Overload signatures
export function getUserBy(field: SafeField, value: string): Promise<UserModel | null>;
export function getUserBy(field: UnsafeField, value: string, type: 'unsafe'): Promise<UnsafeUserModel | null>;

// Implementation
export async function getUserBy(field: SafeField | UnsafeField, value: string, type?: 'unsafe'): Promise<UserModel | UnsafeUserModel | null> {
  const query = type === 'unsafe' ? usersTable : safeUserSelect;

  const [user] = await db
    .select()
    .from(query)
    .where(eq(query[field as Field], value));
  return user || null;
}
