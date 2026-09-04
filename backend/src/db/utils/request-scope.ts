import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { EntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';

/**
 * The tenant and organization ids the guard chain set for this request. A route that reaches
 * scoped code without both `tenantGuard` and `orgGuard` is a wiring bug, not a request error.
 */
export const requestScope = (
  ctx: AuthContext,
  entityType?: EntityType,
): { tenantId: string; organizationId: string } => {
  const { tenantId, organizationId } = ctx.var;
  if (!tenantId || !organizationId) {
    throw new AppError(500, 'server_error', 'error', {
      entityType,
      meta: { reason: 'Scoped query without tenant and organization guards' },
    });
  }
  return { tenantId, organizationId };
};

/**
 * `tenant_id = ? AND organization_id = ?` from guarded context, for every organization-bound
 * product query (lists, counts, updates, soft-deletes, bulk predicates). Redundant with RLS and
 * global UUID identity on purpose: removing RLS must broaden no application query.
 */
export const requestScopeWhere = (
  ctx: AuthContext,
  table: { tenantId: PgColumn; organizationId: PgColumn },
  entityType?: EntityType,
): SQL => {
  const { tenantId, organizationId } = requestScope(ctx, entityType);
  return and(eq(table.tenantId, tenantId), eq(table.organizationId, organizationId)) as SQL;
};
