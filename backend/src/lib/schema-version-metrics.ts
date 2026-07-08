import { otel } from '#/lib/tracing';

const meter = otel.meterProvider.getMeter('app-schema-version');

/** Records `X-Client-Version` header distribution for contract-phase lens telemetry. */
export const clientSchemaVersionSeen = meter.createCounter('schema.client_version.seen', {
  description: 'Requests observed per client schema version (X-Client-Version header)',
});
