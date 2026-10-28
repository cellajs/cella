import type { z } from '@hono/zod-openapi';
import type { DbContext } from '#/core/context';
import { TTLCache } from '#/lib/ttl-cache';
import { countEntityRows } from '#/modules/metrics/metrics-queries';
import { type publicCountsSchema, publicCountTypes } from '#/modules/metrics/metrics-schema';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

type PublicCounts = z.infer<typeof publicCountsSchema>;

const publicCountsCache = new TTLCache<PublicCounts>({ maxSize: 1, defaultTtl: new TimeSpan(1, 'm').milliseconds() });

/** The row count of users and of every channel type, counted at most once a minute per process; concurrent cold reads share one count. */
export async function getPublicCountsOp(ctx: DbContext) {
  return publicCountsCache.load('publicCounts', async () => {
    const countEntries = await Promise.all(
      publicCountTypes.map(async (entityType) => {
        try {
          const total = await countEntityRows(ctx, { entityType });
          return [entityType, total];
        } catch (err) {
          // A failed count reports 0 so the other counts still return
          log.warn('Public count failed', { entityType, err });
          return [entityType, 0];
        }
      }),
    );
    return Object.fromEntries(countEntries) as PublicCounts;
  });
}
