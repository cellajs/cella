import type { MetricOptions } from '#/middlewares/observability/types';

// Define the metrics configuration
export const metricsConfig = {
  requestDuration: {
    type: 'histogram',
    name: 'Request_duration',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'status', 'ok', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10],
  },
  requestsTotal: {
    type: 'counter',
    name: 'Requests_count',
    help: 'Total number and date of requests',
    labelNames: ['requestsNumber', 'date'],
  },
} satisfies Record<string, MetricOptions>;
