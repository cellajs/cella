import { sql } from 'drizzle-orm';

/**
 * Utility function to create a COALESCE expression for a given column and value.
 * This is useful for handling null values in SQL queries, allowing you to provide a default value when the column is null.
 */
export const coalesce = <T>(column: T, value: number) => sql`COALESCE(${column}, ${value})`.mapWith(Number);
