import { trace } from '@opentelemetry/api';
import type { MiddlewareHandler } from 'hono/types';
import { Counter } from 'prom-client';

// Define a Counter metric for HTTP requests
const httpRequestCounter = new Counter({
  name: 'Requests',
  help: 'Total number and date of requests',
  labelNames: ['requestsNumber', 'date'],
});

export const observatoryMiddleware: MiddlewareHandler = async (ctx, next) => {
  const tracer = trace.getTracer('my-tracer');
  const span = tracer.startSpan('traceMiddleware');

  // Add attributes to the trace
  span.setAttribute('method', ctx.req.method);
  span.setAttribute('url', ctx.req.url);
  const currentCounter = await httpRequestCounter.get();
  try {
    // Increment the request counter
    httpRequestCounter.inc({ requestsNumber: currentCounter.values.length + 1, date: new Date().getTime() });
    await next();

    // Set the span status based on the response status
    const { status } = ctx.res;
    span.setStatus({ code: status });
  } finally {
    span.end();
  }
};
