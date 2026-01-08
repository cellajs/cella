import { z } from '@hono/zod-openapi';
import { appConfig, type Severity } from 'config';
import { entityTypeSchema } from '#/utils/schema/common';

const ClientErrorStatusCodeEnum = z
  .number()
  .refine((val) => val >= 400 && val < 500, { message: 'Must be a valid client error status code' });

const ServerErrorStatusCodeEnum = z
  .number()
  .refine((val) => val >= 500 && val < 600, { message: 'Must be a valid server error status code' });

/**
 * Schema for errors in a response.
 */
export const apiErrorSchema = z
  .object({
    name: z.string(), // Error name
    message: z.string(), // Error message
    type: z.string(), // Error type identifier
    status: z.union([ClientErrorStatusCodeEnum, ServerErrorStatusCodeEnum]), // HTTP status code
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
