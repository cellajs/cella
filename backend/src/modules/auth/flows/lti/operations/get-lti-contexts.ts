import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { findOrganizationLtiContexts } from '#/modules/auth/flows/lti/lti-contexts-queries';
import type { listLtiContextsQuerySchema } from '#/modules/auth/flows/lti/lti-schema';
import { getValidChannel } from '#/permissions/get-valid-channel';

/** The courses of the organization's LTI connections and how their last member import ran, for a caller who may update the organization. */
export async function getLtiContextsOp(ctx: UserContext, { orderBy }: z.infer<typeof listLtiContextsQuerySchema>) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const records = await findOrganizationLtiContexts(ctx, {
    tenantId: ctx.var.tenantId,
    organizationId: ctx.var.organizationId,
    order: orderBy.order,
  });
  return records.map(({ context, channel }) => ({
    id: context.id,
    connectionId: context.connectionId,
    contextId: context.contextId,
    label: context.label,
    title: context.title,
    channel,
    apiUrl: context.apiUrl,
    importRanAt: context.importRanAt,
    importReadCount: context.importReadCount,
    importIssue: context.importIssue,
    createdAt: context.createdAt,
  }));
}
