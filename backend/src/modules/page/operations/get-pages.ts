import type { z } from '@hono/zod-openapi';
import { getPages } from '#/modules/page/helpers/get-pages';
import type { pageListQuerySchema } from '#/modules/page/page-schema';

type GetPagesInput = z.infer<typeof pageListQuerySchema>;

export async function getPagesOp(input: GetPagesInput) {
  return getPages(input);
}
