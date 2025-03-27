import type { Context } from 'hono';
import type { CounterConfiguration, HistogramConfiguration } from 'prom-client';
import type { Env } from '#/lib/context';

export type MetricOptions = {
  disabled?: boolean;
  customLabels?: Record<string, (c: Context<Env>) => string>;
} & (({ type: 'counter' } & CounterConfiguration<string>) | ({ type: 'histogram' } & HistogramConfiguration<string>));
