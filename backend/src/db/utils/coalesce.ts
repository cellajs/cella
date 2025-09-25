import { sql } from 'drizzle-orm';

export const coalesce = <T>(column: T, value: number) => sql`COALESCE(${column}, ${value})`.mapWith(Number);
