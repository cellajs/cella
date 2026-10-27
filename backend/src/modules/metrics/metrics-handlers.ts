import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { z } from 'zod';
import type { Env } from '#/core/context';
import { TTLCache } from '#/lib/ttl-cache';
import { countEntityRows } from '#/modules/metrics/metrics-queries';
import { metricRouteConfig as metricRoutes } from '#/modules/metrics/metrics-routes';
import type { publicCountsSchema } from '#/modules/metrics/metrics-schema';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

type CountsType = z.infer<typeof publicCountsSchema>;

const publicCountsCache = new TTLCache<CountsType>({ maxSize: 1, defaultTtl: new TimeSpan(1, 'm').milliseconds() });

app.openapi(metricRoutes.getPublicCounts, async (ctx) => {
  const data = await publicCountsCache.load('publicCounts', async () => {
    const countEntries = await Promise.all(
      appConfig.entityTypes.map(async (entityType) => {
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
    return Object.fromEntries(countEntries) as CountsType;
  });

  return ctx.json(data, 200);
});

export { app as metricHandlers };
