import type { createRoute } from '@hono/zod-openapi';
import { config } from 'config';
import { z } from 'zod';
import type { HttpErrorStatus } from '#/lib/errors';
import { numberEnum } from '../zod';
import { entityTypeSchema } from './common';
import { errorDescriptions } from './error-info';

/**
 * Type alias for the responses parameter of createRoute.
 */
type Responses = Parameters<typeof createRoute>[0]['responses'];

/**
 * Schema for a successful response without data.
 */
export const successWithoutDataSchema = z.object({ success: z.boolean() });

/**
 * Schema for a successful response with data.
 */
export const successWithDataSchema = <T extends z.ZodTypeAny>(schema: T) => z.object({ success: z.boolean(), data: schema });

/**
 * Schema for a successful response with paginated data
 *
 * @param schema - The schema for the items in the paginated data. Data object has `items` and `total` properties.
 */
export const successWithPaginationSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    success: z.boolean(),
    data: z.object({
      items: schema.array(),
      total: z.number(),
    }),
  });

const httpErrorStatusCodes = Object.keys(errorDescriptions).map((key) => Number(key)) as HttpErrorStatus[];
/**
 * Schema for errors in a response.
 */
export const errorSchema = z.object({
  message: z.string(), // Error message
  type: z.string(), // Error type identifier
  status: z.number().superRefine(numberEnum(httpErrorStatusCodes)), // HTTP status code
  severity: z.enum(config.severityLevels), // Severity level
  entityType: entityTypeSchema.optional(), // Optional related entity type
  logId: z.string().optional(), // Optional log identifier
  path: z.string().optional(), // Optional request path
  method: z.string().optional(), // Optional HTTP method
  timestamp: z.string().optional(), // Optional timestamp
  usr: z.string().optional(), // Optional user identifier
  org: z.string().optional(), // Optional organization identifier
});

/**
 * Schema for a successful response with errors.
 */
export const successWithErrorsSchema = () =>
  z.object({
    success: z.boolean(),
    errors: z.array(errorSchema),
  });

/**
 * Schema for a failed response with errors.
 */
export const failWithErrorSchema = z.object({
  success: z.boolean().default(false),
  error: errorSchema,
});

/**
 * Set of error responses with descriptions and schemas. Based of `errorDescriptions`
 */
export const errorResponses = Object.keys(errorDescriptions).reduce(
  (acc, key) => {
    const code = Number(key) as HttpErrorStatus;
    acc[code] = {
      description: errorDescriptions[code],
      content: { 'application/json': { schema: failWithErrorSchema } },
    };
    return acc;
  },
  {} as Record<HttpErrorStatus, { description: string; content: Record<string, { schema: typeof failWithErrorSchema }> }>,
) satisfies Responses;
