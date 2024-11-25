import type { MiddlewareHandler } from 'hono/types';
import { Counter, Histogram } from 'prom-client';
import { metricsConfig } from '#/middlewares/observatory/config';

// Prometheus metrics Initialize
const observatoryRequestDurationHistogram = new Histogram({
  name: metricsConfig.requestDuration.name,
  help: metricsConfig.requestDuration.help,
  labelNames: metricsConfig.requestDuration.labelNames,
  buckets: metricsConfig.requestDuration.buckets,
});

const observatoryRequestsCounter = new Counter({
  name: metricsConfig.requestsTotal.name,
  help: metricsConfig.requestsTotal.help,
  labelNames: metricsConfig.requestsTotal.labelNames,
});

export const observatoryMiddleware: MiddlewareHandler = async (ctx, next) => {
  const start = Date.now();

  // Incrementing request count
  const currentCounter = await observatoryRequestsCounter.get();
  observatoryRequestsCounter.inc({ requestsNumber: currentCounter.values.length + 1, date: new Date().getTime() });

  // Measure request duration and record it in the histogram
  const duration = (Date.now() - start) / 1000; // Convert milliseconds to seconds
  observatoryRequestDurationHistogram.observe(
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
