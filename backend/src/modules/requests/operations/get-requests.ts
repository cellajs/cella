import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { findRequestsPaginated } from '#/modules/requests/requests-queries';
import type { requestListQuerySchema } from '#/modules/requests/requests-schema';

type GetRequestsInput = z.infer<typeof requestListQuerySchema>;

/** A page of the requests of every type, searched by address, and the total. */
export async function getRequestsOp(ctx: UserContext, input: GetRequestsInput) {
  const { q, sort, order, offset, limit } = input;
  return findRequestsPaginated(ctx, { q, sort, order, limit, offset });
}
