import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
} as const;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const relationTables: { [key: string]: PgTableWithColumns<any> } = {};

export const entityMenuSections = [
  {
    storageType: 'organizations' as const,
    type: 'organization' as const,
    isSubmenu: false,
  },
];
