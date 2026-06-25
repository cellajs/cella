/**
 * Schema-evolution telemetry (Phase 1).
 *
 * Records the `X-Client-Version` header distribution as the fleet floor used to
 * gate contract-phase lenses. Telemetry-only in Phase 1 — no transform decision
 * depends on it. See info/SCHEMA_EVOLUTION.md (1.0, 1.9).
 */
import { otel } from '#/lib/tracing';

const meter = otel.meterProvider.getMeter('app-schema-version');

export const clientSchemaVersionSeen = meter.createCounter('schema.client_version.seen', {
  description: 'Requests observed per client schema version (X-Client-Version header)',
});
