import { type AnyPgColumn, foreignKey } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/modules/organization/organization-db';

/**
 * Composite `(tenant_id, organization_id)` foreign key for every organization-bound table: a row's
 * tenant can never disagree with its organization's tenant, and the row goes with the organization.
 * Tenant and organization are 1:1 (`organizations_tenant_id_key`), which is what lets request scope
 * be a plain comparison of both ids.
 */
export const organizationForeignKey = (table: { tenantId: AnyPgColumn; organizationId: AnyPgColumn }) =>
  foreignKey({
    columns: [table.tenantId, table.organizationId],
    foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
  }).onDelete('cascade');
