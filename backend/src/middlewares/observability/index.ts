import type { MiddlewareHandler } from 'hono/types';
import { Counter, Histogram } from 'prom-client';
import { metricsConfig } from '#/middlewares/observability/config';

// Prometheus metrics Initialize
const observabilityRequestDurationHistogram = new Histogram({
  name: metricsConfig.requestDuration.name,
  help: metricsConfig.requestDuration.help,
  labelNames: metricsConfig.requestDuration.labelNames,
  buckets: metricsConfig.requestDuration.buckets,
});

const observabilityRequestsCounter = new Counter({
  name: metricsConfig.requestsTotal.name,
  help: metricsConfig.requestsTotal.help,
  labelNames: metricsConfig.requestsTotal.labelNames,
});

/**
 * Middleware that tracks request metrics for observability purposes, such as request count and request duration.
 * It increments a counter for each incoming request and records the duration of each request.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call after this middleware completes its work.
 */
export const observabilityMiddleware: MiddlewareHandler = async (ctx, next) => {
  const start = Date.now();

  // Incrementing request count
  const currentCounter = await observabilityRequestsCounter.get();
  observabilityRequestsCounter.inc({ requestsNumber: currentCounter.values.length + 1, date: new Date().getTime() });

  // Measure request duration and record it in the histogram
  const duration = (Date.now() - start) / 1000; // Convert milliseconds to seconds
  observabilityRequestDurationHistogram.observe(
    {
      method: ctx.req.method,
      status: ctx.res.status.toString(),
      ok: ctx.res.status,
      route: ctx.req.url,
    },
    duration,
  );

  await next();
};
