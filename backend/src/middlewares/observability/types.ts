import type { Context } from 'hono';
import type { CounterConfiguration, HistogramConfiguration } from 'prom-client';

export type MetricOptions = {
  disabled?: boolean;
  customLabels?: Record<string, (c: Context) => string>;
} & (({ type: 'counter' } & CounterConfiguration<string>) | ({ type: 'histogram' } & HistogramConfiguration<string>));
