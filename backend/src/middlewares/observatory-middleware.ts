import { trace } from '@opentelemetry/api';
import type { MiddlewareHandler } from 'hono/types';
import { Counter } from 'prom-client';

const httpRequestCounter = new Counter({
  name: 'Requests',
  help: 'Total number and date of requests',
  labelNames: ['requestsNumber', 'date'],
});

export const observatoryMiddleware: MiddlewareHandler = async (ctx, next) => {
  const tracer = trace.getTracer('my-tracer');
  const span = tracer.startSpan('traceMiddleware');
  span.setAttribute('method', ctx.req.method);
  span.setAttribute('url', ctx.req.url);

  const currentCounter = await httpRequestCounter.get();
  try {
    httpRequestCounter.inc({ requestsNumber: currentCounter.values.length + 1, date: new Date().getTime() });

    // Wait for other handlers to run.
    await next();

    const { status } = ctx.res;
    span.setStatus({ code: status });
  } finally {
    span.end();
  }
};
