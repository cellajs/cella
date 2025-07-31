import { z } from '@hono/zod-openapi';
import { appConfig, type Severity } from 'config';
import { entityTypeSchema } from '#/utils/schema/common';

const ClientErrorStatusCodeEnum = z.union([
  z.literal(400),
  z.literal(401),
  z.literal(402),
  z.literal(403),
  z.literal(404),
  z.literal(405),
  z.literal(406),
  z.literal(407),
  z.literal(408),
  z.literal(409),
  z.literal(410),
  z.literal(411),
  z.literal(412),
  z.literal(413),
  z.literal(414),
  z.literal(415),
  z.literal(416),
  z.literal(417),
  z.literal(418),
  z.literal(421),
  z.literal(422),
  z.literal(423),
  z.literal(424),
  z.literal(425),
  z.literal(426),
  z.literal(428),
  z.literal(429),
  z.literal(431),
  z.literal(451),
]);

const ServerErrorStatusCodeEnum = z.union([
  z.literal(500),
  z.literal(501),
  z.literal(502),
  z.literal(503),
  z.literal(504),
  z.literal(505),
  z.literal(506),
  z.literal(507),
  z.literal(508),
  z.literal(510),
  z.literal(511),
]);
/**
 * Schema for errors in a response.
 */
export const errorSchema = z
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
