import { type SQL, and, eq } from 'drizzle-orm';
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
