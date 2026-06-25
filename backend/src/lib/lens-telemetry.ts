/**
 * Wires doba lens telemetry into otel (info/SCHEMA_EVOLUTION.md, 1.9).
 *
 * Imported for side-effect at server startup. Phase 1 server-side migrations are
 * limited (graph payoff is Phase 2), but the hooks are registered up front so any
 * transform — including Phase 2 peer downgrades — is observable from day one.
 */
import { configureLensTelemetry, type RegistryHooks } from 'shared/version-changes';
import { otel } from '#/lib/tracing';

const meter = otel.meterProvider.getMeter('app-lens');

const transformDuration = meter.createHistogram('lens.transform.duration_ms', {
  description: 'Duration of a doba lens transform (full chain) in milliseconds',
});
const stepDuration = meter.createHistogram('lens.step.duration_ms', {
  description: 'Duration of a single lens migration step in milliseconds',
});
const warnings = meter.createCounter('lens.warnings', {
  description: 'Warnings emitted during lens transforms',
});

const hooks: RegistryHooks<string> = {
  onTransform: (info) => transformDuration.record(info.durationMs, { from: info.from, to: info.to, ok: info.ok }),
  onStep: (info) => stepDuration.record(info.durationMs, { from: info.from, to: info.to, ok: info.ok }),
  onWarning: (_message, from, to) => warnings.add(1, { from, to }),
};

configureLensTelemetry(hooks);
