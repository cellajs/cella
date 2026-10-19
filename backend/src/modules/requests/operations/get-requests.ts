import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { requestsTable } from '#/modules/requests/requests-db';
import { findRequestsPaginated } from '#/modules/requests/requests-queries';
import type { requestListQuerySchema } from '#/modules/requests/requests-schema';
import { textSearchFilter } from '#/utils/sql';

type GetRequestsInput = z.infer<typeof requestListQuerySchema>;

export async function getRequestsOp(ctx: UserContext, input: GetRequestsInput) {
  const { q, sort, order, offset, limit } = input;

  const filter = q ? textSearchFilter(requestsTable.email, q) : undefined;

  const { items, total } = await findRequestsPaginated(ctx, { filter, sort, order, limit, offset });

  return { items, total };
}
