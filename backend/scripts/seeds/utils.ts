import { db } from "#/db/db";
import { organizationsTable } from "#/db/schema/organizations";
import { usersTable } from "#/db/schema/users";

/**
 * Checks if there is at least one organization seeded in the database.
 * @returns A promise that resolves to `true` if the organizations table contains any records, otherwise `false`.
 */
export const isOrganizationAlreadySeeded = async () => {
  const organizationsInTable = await db
    .select()
    .from(organizationsTable)
    .limit(1);

  return organizationsInTable.length > 0;
};

/**
 * Checks if there is at least one user seeded in the database.
 * @returns A promise that resolves to `true` if the users table contains any records, otherwise `false`.
 */
export const isUserAlreadySeeded = async () => {
  const usersInTable = await db
    .select()
    .from(usersTable)
    .limit(1);

  return usersInTable.length > 0;
}