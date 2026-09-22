import type { UserContext } from '#/core/context';
import type { ConnectedApp } from '#/modules/me/me-schema';
import { findGrantsByAccount } from '#/modules/oauth-server/oauth-server-queries';

/** Grants carry `accountId`; the client name comes from the registered app, or from the CIMD URL for MCP clients. */
export async function getConnectedAppsOp(ctx: UserContext): Promise<{ items: ConnectedApp[] }> {
  const rows = await findGrantsByAccount(ctx, { accountId: ctx.var.user.id });
  const items = rows.map(({ row, clientName }) => {
    const payload = row.payload as { clientId?: string; resources?: Record<string, string> };
    const resources = payload.resources ?? {};
    return {
      id: row.id,
      clientId: payload.clientId ?? '',
      clientName: clientName ?? payload.clientId ?? '',
      scopes: [...new Set(Object.values(resources).flatMap((scope) => scope.split(' ')))].filter(Boolean),
      resources: Object.keys(resources),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  });
  return { items };
}
