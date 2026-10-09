import { configureLensTelemetry, type RegistryHooks } from 'shared/schema-evolution';
import { otel } from '#/lib/tracing';

const meter = otel.meterProvider.getMeter('app-lens');

const transformDuration = meter.createHistogram('lens.transform.duration', {
  description: 'Duration of a doba lens transform (full chain)',
  unit: 'ms',
});
const stepDuration = meter.createHistogram('lens.step.duration', { description: 'Duration of a single lens migration step', unit: 'ms' });
const warnings = meter.createCounter('lens.warnings', { description: 'Warnings emitted during lens transforms', unit: '{warning}' });

const hooks: RegistryHooks<string> = {
  onTransform: (info) => transformDuration.record(info.durationMs, { from: info.from, to: info.to, ok: info.ok }),
  onStep: (info) => stepDuration.record(info.durationMs, { from: info.from, to: info.to, ok: info.ok }),
  onWarning: (_message, from, to) => warnings.add(1, { from, to }),
};

configureLensTelemetry(hooks);
