import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { maxLength } from '#/db/utils/constraints';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { connectionKinds, connectionStatuses, connectionsTable } from '#/modules/connections/connections-db';
import { mockConnectionResponse } from '#/modules/connections/connections-mocks';
import { validDomainSchema, validNameSchema, validUrlSchema } from '#/schemas';
import { auditShape } from '#/schemas/entity-base';

const federationKeys = Object.keys(appConfig.federations);

/** A federation key of this app's config; the enum is listed when the app declares any. */
const federationKeySchema = z
  .string()
  .refine(isFederationKey, { message: 'Unknown federation' })
  .openapi({ description: 'A federation key in appConfig.federations', ...(federationKeys.length ? { enum: federationKeys } : {}) });

const idpEntityIdSchema = z.string().min(1).max(maxLength.field);

const connectionConfigSchema = z.object({
  idpEntityIds: z.array(idpEntityIdSchema).optional().describe("The institution's IdP entity ids, passed as login_hint"),
  logoUrl: z.string().url().max(maxLength.field).optional().describe("The institution's logo, for the entry page"),
});

export const connectionSchema = z
  .object({
    ...createSelectSchema(connectionsTable, {
      kind: z.enum(connectionKinds),
      status: z.enum(connectionStatuses),
      claimValues: z.array(z.string()),
      config: connectionConfigSchema,
    }).shape,
    ...auditShape,
  })
  .openapi('Connection', {
    description:
      "A tenant's trust in an external party that asserts user identities: an institution reached through an SSO federation, whose members sign in to the tenant's organization. Its id is the public key of the tenant's SSO entry page. System admins manage connections per tenant; `pending` until the institution activated the service at the federation.",
    example: mockConnectionResponse(),
    'x-tags': schemaTags('data', 'connections', 'cella'),
  });

export const createConnectionBodySchema = z.object({
  issuer: federationKeySchema,
  displayName: validNameSchema.describe("The institution's name, as the federation's metadata lists it"),
  claimValues: z
    .array(validDomainSchema)
    .min(1)
    .max(20)
    .describe("The institution's domains as the federation asserts them in the tenant claim; a sign-in must assert one of them"),
  idpEntityIds: z.array(idpEntityIdSchema).min(1).max(10).describe("The institution's IdP entity ids, all passed as login_hint"),
  status: z.enum(connectionStatuses).optional(),
  jitProvisioning: z.boolean().optional(),
  // The response keeps the field limit, and the frontend validates responses: a longer stored URL would fail every read.
  logoUrl: z.string().max(maxLength.field).pipe(validUrlSchema).optional(),
});

export const updateConnectionBodySchema = createConnectionBodySchema.omit({ issuer: true }).partial();
