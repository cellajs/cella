import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource, processDetector } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { config } from 'config';

export const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: config.name,
    [ATTR_SERVICE_VERSION]: '1.0',
  }),
  resourceDetectors: [processDetector],
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [new HttpInstrumentation()],
});
