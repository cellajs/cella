import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { findRequestsPaginated } from '#/modules/requests/requests-queries';
import type { requestListQuerySchema } from '#/modules/requests/requests-schema';
import type { PageWindow } from '#/utils/list-page';

type GetRequestsInput = z.infer<typeof requestListQuerySchema>;

/** A page of the requests of every kind, searched by address, and the total. */
export async function getRequestsOp(ctx: UserContext, input: GetRequestsInput, { offset, limit }: PageWindow) {
  const { q, orderBy } = input;
  return findRequestsPaginated(ctx, { q, ...orderBy, limit, offset });
}
