import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { findOrganizationLtiContexts } from '#/modules/auth/flows/lti/lti-contexts-queries';
import type { listLtiContextsQuerySchema } from '#/modules/auth/flows/lti/lti-schema';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { PageWindow } from '#/utils/list-page';

/** A page of the courses of the organization's LTI connections and how their last member import ran, for a caller who may update the organization. */
export async function getLtiContextsOp(ctx: UserContext, { connectionId, orderBy }: z.infer<typeof listLtiContextsQuerySchema>, page: PageWindow) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const { items, total } = await findOrganizationLtiContexts(ctx, {
    tenantId: ctx.var.tenantId,
    organizationId: ctx.var.organizationId,
    connectionId,
    order: orderBy.order,
    ...page,
  });
  const contexts = items.map(({ context, channel }) => ({
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
  return { items: contexts, total };
}
