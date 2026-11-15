import { and, eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { LinkedChannel } from '#/lib/module';
import { channelCodesTable } from '#/modules/links/links-db';
import { publiclyServedTenant } from '#/modules/tenants/tenants-queries';

/** The channel a code names, with no request scope; undefined for an unknown code or a tenant no public read serves. */
export const findChannelByCode = async (ctx: DbContext, code: string): Promise<LinkedChannel | undefined> => {
  const [channel] = await ctx.var.db
    .select({
      code: channelCodesTable.code,
      tenantId: channelCodesTable.tenantId,
      channelType: channelCodesTable.channelType,
      channelId: channelCodesTable.channelId,
    })
    .from(channelCodesTable)
    .where(and(eq(channelCodesTable.code, code), publiclyServedTenant(channelCodesTable.tenantId)))
    .limit(1);
  return channel;
};
