import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { z } from 'zod';
import type { Env } from '#/core/context';
import { countEntityRows } from '#/modules/metrics/metrics-queries';
import { metricRouteConfig as metricRoutes } from '#/modules/metrics/metrics-routes';
import '#/modules/metrics/metrics-module';
import type { publicCountsSchema } from '#/modules/metrics/metrics-schema';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

type CountsType = z.infer<typeof publicCountsSchema>;

// Store public counts in memory with a 1-minute cache
const publicCountsCache = new Map<string, { data: CountsType; expiresAt: number }>();

app.openapi(metricRoutes.getPublicCounts, async (ctx) => {
  const cacheKey = 'publicCounts';
  const cached = publicCountsCache.get(cacheKey);

  // Use cache if valid
  if (cached) {
    const isExpired = cached.expiresAt <= Date.now();
    if (!isExpired) return ctx.json(cached.data, 200);
  }

  // Query counts for all entity types
  const countEntries = await Promise.all(
    appConfig.entityTypes.map(async (entityType) => {
      try {
        const total = await countEntityRows(ctx, { entityType });
        return [entityType, total];
      } catch (err) {
        // Fallback: 0 (avoids breaking all counts)
        return [entityType, 0];
      }
    }),
  );

  const data = Object.fromEntries(countEntries) as CountsType;

  // Cache result for 1 minute
  const expiresAt = Date.now() + new TimeSpan(1, 'm').milliseconds();
  publicCountsCache.set(cacheKey, { data, expiresAt });

  return ctx.json(data, 200);
});

export { app as metricHandlers };
