import { z } from '@hono/zod-openapi';
import { appConfig, type Severity } from 'config';
import { entityTypeSchema } from './common-schemas';

/**
 * HTTP error status code (4xx or 5xx).
 * Runtime validation ensures valid error codes, OpenAPI represents as number with min/max.
 */
const errorStatusCodeSchema = z
  .number()
  .int()
  .min(400)
  .max(599)
  .refine((val) => val >= 400 && val < 600, { message: 'Must be a valid error status code (400-599)' });

/**
 * Schema for errors in a response.
 */
export const apiErrorSchema = z
  .object({
    name: z.string(), // Error name
    message: z.string(), // Error message
    type: z.string(), // Error type identifier
    status: errorStatusCodeSchema, // HTTP status code (single schema, no union duplication)
    severity: z.enum(Object.keys(appConfig.severityLevels) as [Severity, ...Severity[]]), // Severity level
    entityType: entityTypeSchema.optional(), // Optional related entity type
    logId: z.string().optional(), // Optional log identifier
    path: z.string().optional(), // Optional request path
    method: z.string().optional(), // Optional HTTP method
    timestamp: z.string().optional(), // Optional timestamp
    userId: z.string().optional(), // Optional user identifier
    organizationId: z.string().optional(), // Optional organization identifier
  })
  .openapi('ApiError');
