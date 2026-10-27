import type { Attributes } from '@opentelemetry/api';
import {
  detectResources,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
  type Resource,
  resourceFromAttributes,
} from '@opentelemetry/resources';

/**
 * The resource every signal of a service carries: the host, OS and process attributes and those `OTEL_RESOURCE_ATTRIBUTES`
 * names, with the service's own (`service.name`, `service.version`, `deployment.environment.name`) over them. The
 * service builds it for its traces and metrics, and the pino transport's worker thread builds it for the logs.
 */
export const serviceResource = (serviceAttributes: Attributes): Resource =>
  detectResources({ detectors: [envDetector, hostDetector, osDetector, processDetector] }).merge(resourceFromAttributes(serviceAttributes));
