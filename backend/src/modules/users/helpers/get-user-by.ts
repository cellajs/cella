import { type SQL, and, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type UnsafeUserModel, type UserModel, usersTable } from '#/db/schema/users';
import { userSelect } from '#/modules/users/helpers/select';

type SafeQuery = typeof userSelect;
type UnsafeQuery = typeof usersTable;

type SafeField = Extract<keyof SafeQuery, keyof SafeQuery['_']['columns']>;
type UnsafeField = Extract<keyof UnsafeQuery, keyof UnsafeQuery['_']['columns']>;

type SelectType = 'unsafe' | 'safe';

// Overload signatures
export function getUserBy(field: SafeField, value: string): Promise<UserModel | null>;
export function getUserBy(field: UnsafeField, value: string, type: 'unsafe'): Promise<UnsafeUserModel | null>;

/**
 * Fetch a user based on a field and value.
 *
 * @param field - The field to search by.
 * @param value - The value to search for in the specified field.
 * @param type(optional) - can be 'unsafe' or undefined. Determines which user fields to return:
 *              - 'unsafe' returns the full users table,
 *              - undefined defaults to the safe user fields.
 * @returns A promise that resolves to a UserModel, UnsafeUserModel, or `null` if no user is found.
 */
export async function getUserBy(
  field: SafeField | UnsafeField,
  value: string,
  type: SelectType = 'safe',
): Promise<UserModel | UnsafeUserModel | null> {
  const select = type === 'unsafe' ? usersTable : userSelect;

  // Check if the field is 'email' to handle it differently
  const conditions = field === 'email' ? eq(emailsTable.email, value) : eq(usersTable[field], value);

  const [result] = await db
    .select({ user: select })
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(conditions)
    .limit(1);

  return result?.user ?? null;
}

// Overload signatures
export function getUsersByConditions(whereArray: (SQL<unknown> | undefined)[]): Promise<UserModel[]>;
export function getUsersByConditions(whereArray: (SQL<unknown> | undefined)[], type: 'unsafe'): Promise<UnsafeUserModel[]>;

/**
 * Fetch users based on multiple conditions, with optional support for unsafe or limited data queries.
 *
 * @param whereArray - An array of drizzle filter and conditional operators, combined using the `and` operator to apply the conditions.
 * @param type (default 'safe') Determines which user fields to return:
 *               - 'unsafe' returns the full users table,
 *               - safe omits sensitive fields such as hashedPassword and unsubscribeToken.
 * @returns A promise that resolves to an array of UserModel or UnsafeUserModel based on the `type`.
 */
export async function getUsersByConditions(whereArray: (SQL<unknown> | undefined)[], type?: SelectType): Promise<UserModel[] | UnsafeUserModel[]> {
  const select = type === 'unsafe' ? usersTable : userSelect;

  // Always join emailsTable
  const result = await db
    .select({ user: select })
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(and(...whereArray.filter(Boolean))) // filter out undefined conditions
    .execute();

  return result.map(({ user }) => user);
}
