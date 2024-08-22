import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource } from '@opentelemetry/resources';
import { processDetector } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { config } from 'config';

export const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: config.name,
    [SEMRESATTRS_SERVICE_VERSION]: '1.0',
  }),
  resourceDetectors: [processDetector],
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [new HttpInstrumentation()],
});
