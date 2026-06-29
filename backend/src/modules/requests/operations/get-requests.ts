import type { z } from '@hono/zod-openapi';
import { ilike } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { requestsTable } from '#/modules/requests/requests-db';
import { getRequestsList } from '#/modules/requests/requests-queries';
import type { requestListQuerySchema } from '#/modules/requests/requests-schema';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetRequestsInput = z.infer<typeof requestListQuerySchema>;

export async function getRequestsOp(ctx: AuthContext, input: GetRequestsInput) {
  const { q, sort, order, offset, limit } = input;

  const filter = q ? ilike(requestsTable.email, prepareStringForILikeFilter(q)) : undefined;

  const { items, total } = await getRequestsList(ctx, { filter, sort, order, limit, offset });

  return { items, total };
}
