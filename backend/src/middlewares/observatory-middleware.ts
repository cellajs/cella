import type { MiddlewareHandler } from 'hono/types';
import { Counter } from 'prom-client';
import { trace } from '@opentelemetry/api';

const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method'],
});

const httpResponseCounter = new Counter({
  name: 'http_responses_total',
  help: 'Total number of HTTP responses',
  labelNames: ['status', 'path'],
});

export const observatoryMiddleware: MiddlewareHandler = async (ctx, next) => {
  const tracer = trace.getTracer('my-tracer');
  const span = tracer.startSpan('traceMiddleware');
  span.setAttribute('method', ctx.req.method);
  span.setAttribute('url', ctx.req.url);

  try {
    const { method } = ctx.req;
    httpRequestCounter.inc({ method });

    // Wait for other handlers to run.
    await next();

    const { status } = ctx.res;
    span.setStatus({ code: status });
    // Get a parameterized path name like `/posts/:id` instead of `/posts/1234`.
    // Tries to find actual route names first before falling back on potential middleware handlers like `app.use('*')`.
    const path = ctx.req.matchedRoutes.find((r) => r.method !== 'ALL')?.path ?? ctx.req.routePath;
    httpResponseCounter.inc({ status, path });
  } finally {
    span.end();
  }
};
