import { and, eq, sql } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { clientsTable } from '#/modules/oauth-server/clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { log } from '#/utils/logger';

/** A consent the user gave: one Grant row of the authorization server, read for the account page. */
export interface ConnectedApp {
  id: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  resources: string[];
  createdAt: string;
  expiresAt: string | null;
}

/** Grants carry `accountId`; the client name comes from the registered app, or from the CIMD URL for MCP clients. */
export async function getConnectedAppsOp(ctx: UserContext): Promise<{ items: ConnectedApp[] }> {
  const rows = await ctx.var.db
    .select({ row: oidcPayloadsTable, clientName: clientsTable.name })
    .from(oidcPayloadsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, sql`${oidcPayloadsTable.payload}->>'clientId'`))
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.accountId, ctx.var.user.id)))
    .orderBy(oidcPayloadsTable.createdAt);

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

/** Revoking a consent deletes the Grant and every token issued under it; the client must ask again. */
export async function revokeConnectedAppOp(ctx: UserContext, grantId: string): Promise<{ id: string }> {
  const [grant] = await ctx.var.db
    .select({ id: oidcPayloadsTable.id })
    .from(oidcPayloadsTable)
    .where(
      and(
        eq(oidcPayloadsTable.type, 'Grant'),
        eq(oidcPayloadsTable.id, grantId),
        eq(oidcPayloadsTable.accountId, ctx.var.user.id),
      ),
    )
    .limit(1);
  if (!grant) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connectedApp' } });

  await ctx.var.db.transaction(async (tx) => {
    await tx.delete(oidcPayloadsTable).where(eq(oidcPayloadsTable.grantId, grantId));
    await tx
      .delete(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId)));
  });
  log.info('Connected app revoked', { grantId, userId: ctx.var.user.id });
  return { id: grantId };
}
