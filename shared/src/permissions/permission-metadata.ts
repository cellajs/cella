import type { ContextEntityType, ProductEntityType } from '../../types';

/**
 * Physical schema metadata the standalone yjs relay needs to authorize edits WITHOUT importing
 * backend drizzle tables (which would drag the whole backend into the worker's build context).
 *
 * Backend remains the source of truth: a backend test (`permission-metadata.test.ts`) asserts these
 * table/column names match the live drizzle tables, so the two can never silently drift.
 *
 * Forks extend `entityMetadata` when they add collaboratively-editable entity types.
 */

/** Columns the permission engine reads from an entity table, keyed by logical name → physical column. */
export interface EntityTableMetadata {
  /** Physical table name (e.g. `organizations`). */
  table: string;
  /**
   * Logical-key → physical-column-name. Always includes `id`. Optional `createdBy`/`tenantId` and
   * ancestor id keys (e.g. `organizationId`) are present only when the table actually has them
   * (e.g. tenant-less `pages` omits `tenantId`).
   */
  columns: { id: string } & Partial<Record<string, string>>;
}

/** Columns the permission engine reads from the memberships table. */
export interface MembershipTableMetadata {
  table: string;
  columns: { contextType: string; contextId: string; role: string; userId: string };
}

export const membershipMetadata: MembershipTableMetadata = {
  table: 'memberships',
  columns: { contextType: 'context_type', contextId: 'context_id', role: 'role', userId: 'user_id' },
};

export const entityMetadata: Partial<Record<ContextEntityType | ProductEntityType, EntityTableMetadata>> = {
  organization: {
    table: 'organizations',
    columns: { id: 'id', createdBy: 'created_by', tenantId: 'tenant_id' },
  },
  attachment: {
    table: 'attachments',
    columns: { id: 'id', createdBy: 'created_by', tenantId: 'tenant_id', organizationId: 'organization_id' },
  },
  page: {
    // Parentless, tenant-less product entity — no tenantId / ancestor columns.
    table: 'pages',
    columns: { id: 'id', createdBy: 'created_by' },
  },
};
