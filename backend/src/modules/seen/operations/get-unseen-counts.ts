import { hierarchy } from 'shared';
import type { AuthContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { groupingContextTypes, seenWindowMs, trackedEntityTypes } from '#/modules/seen/operations/mark-seen';
import { findUnseenCountsByUser } from '#/modules/seen/seen-queries';

export async function getUnseenCountsOp(ctx: AuthContext) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  // Set() widens the fixed-length config tuple so an empty fork config is a real runtime check.
  if (memberships.length === 0 || new Set(trackedEntityTypes).size === 0) {
    return {};
  }

  // Any tracked type with no parent groups by org → org ids join the context id set.
  const needsOrgFallback = trackedEntityTypes.some((t) => !hierarchy.getParent(t));

  // Group the user's context ids by tenant. Entity tables have FORCE ROW LEVEL SECURITY with a
  // tenant-scoped policy, so the count must run inside tenantRead (sets app.tenant_id) — a plain
  // baseDb read returns zero rows. A user's memberships can span tenants, so we read per tenant.
  const contextIdsByTenant = new Map<string, Set<string>>();
  const addContextId = (tenantId: string, contextId: string) => {
    const set = contextIdsByTenant.get(tenantId) ?? new Set<string>();
    set.add(contextId);
    contextIdsByTenant.set(tenantId, set);
  };
  for (const m of memberships) {
    if (groupingContextTypes.has(m.contextType)) addContextId(m.tenantId, m.contextId);
    if (needsOrgFallback) addContextId(m.tenantId, m.organizationId);
  }

  if (contextIdsByTenant.size === 0) {
    return {};
  }

  const windowCutoff = new Date(Date.now() - seenWindowMs).toISOString();
  const results: Record<string, Record<string, number>> = {};

  // Count tracked entities created within the rolling window that this user has not seen, grouped
  // by home context. A single NOT EXISTS per type — exact, no total-minus-seen skew. Rows older
  // than seen_by retention never participate: they cannot be marked seen, so scoping the count to
  // the same window is what lets badges reach zero and stay there.
  for (const [tenantId, contextIdSet] of contextIdsByTenant) {
    const unseenRows = await tenantRead({ var: { ...ctx.var, tenantId } } as AuthContext, (readCtx) =>
      findUnseenCountsByUser(readCtx, {
        userId: user.id,
        contextIds: [...contextIdSet],
        entityTypes: trackedEntityTypes,
        cutoff: windowCutoff,
      }),
    );

    for (const row of unseenRows) {
      if (row.unseenCount <= 0) continue;
      if (!results[row.contextId]) results[row.contextId] = {};
      results[row.contextId][row.entityType] = row.unseenCount;
    }
  }

  return results;
}
