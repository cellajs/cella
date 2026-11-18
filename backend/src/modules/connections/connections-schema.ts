import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { maxLength } from '#/db/utils/constraints';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { federationKeySchema } from '#/modules/auth/core';
import { connectionKinds, connectionStatuses, connectionsTable } from '#/modules/connections/connections-db';
import { mockConnectionResponse } from '#/modules/connections/connections-mocks';
import { tenantOnlyParamSchema, tenantOrgParamSchema, validDomainSchema, validIdSchema, validNameSchema, validUrlSchema } from '#/schemas';
import { auditShape } from '#/schemas/entity-base';

const idpEntityIdSchema = z.string().min(1).max(maxLength.field);

/** An SSO connection's protocol part. One IdP entity id skips the federation's picker; the logo comes from its metadata feed. */
const ssoConnectionConfigSchema = z.object({
  idpEntityIds: z.array(idpEntityIdSchema).optional().describe("The institution's IdP entity ids, passed as login_hint"),
  logoUrl: z.url().max(maxLength.field).optional().describe("The institution's logo, for the entry page"),
});

const platformAddressSchema = z.string().max(maxLength.url);

/** LTI deployments one connection keeps; a platform makes one per place the app is installed. */
const maxLtiDeployments = 100;

/** An LTI connection's protocol part: the platform's endpoints from its configuration, and its LTI deployments. */
const ltiConnectionConfigSchema = z.object({
  authorizationEndpoint: platformAddressSchema.describe("The platform's OIDC authorization endpoint, where a launch's login goes"),
  tokenEndpoint: platformAddressSchema.describe("The platform's token endpoint, for its services"),
  authorizationServer: platformAddressSchema
    .optional()
    .describe('The audience of a token request at the platform, when it names one apart from its token endpoint'),
  jwksUri: platformAddressSchema.describe("The platform's key set, which signs its launches"),
  registrationClientUri: platformAddressSchema.optional().describe("The platform's address of this registration, when it gave one"),
  productFamilyCode: z.string().max(maxLength.field).describe("The platform's product, such as `canvas` or `moodle`"),
  version: z.string().max(maxLength.field).describe("The platform's version"),
  deploymentIds: z
    .array(z.string().max(maxLength.field))
    .max(maxLtiDeployments)
    .describe('The LTI deployments of the app at the platform; empty until the platform names one'),
});

export type LtiConnectionConfig = z.infer<typeof ltiConnectionConfigSchema>;
type SsoConnectionConfig = z.infer<typeof ssoConnectionConfigSchema>;

/** One kind's config, its members absent from the other kind's: a reader of an SSO member needs no narrowing. */
export type ConnectionConfig =
  | (SsoConnectionConfig & { [K in keyof LtiConnectionConfig]?: never })
  | (LtiConnectionConfig & { [K in keyof SsoConnectionConfig]?: never });

export const connectionSchema = z
  .object({
    ...createSelectSchema(connectionsTable, {
      kind: z.enum(connectionKinds),
      status: z.enum(connectionStatuses),
      claimValues: z.array(z.string()),
      // The LTI shape goes first. Every SSO member is optional, and the SSO shape alone would match an LTI config too.
      config: z.union([ltiConnectionConfigSchema, ssoConnectionConfigSchema]),
    }).shape,
    ...auditShape,
  })
  .openapi('Connection', {
    description:
      "A tenant's trust in an external party that asserts user identities: an institution reached through an SSO federation, whose members sign in to the tenant's organization (`sso`), or an LTI platform the app registered at, which launches it (`lti`). An SSO connection's id is the public key of the tenant's SSO entry page. System admins manage SSO connections per tenant, `pending` until the institution activated the service at the federation; organization admins register LTI connections.",
    example: mockConnectionResponse(),
    'x-tags': schemaTags('data', 'connections', 'cella'),
  });

/** The path of one connection of a tenant. */
export const connectionParamSchema = tenantOnlyParamSchema.extend({ connectionId: validIdSchema });

/** The path of one connection of an organization's tenant. */
export const organizationConnectionParamSchema = tenantOrgParamSchema.extend({ connectionId: validIdSchema });

export const ltiRegistrationLinkSchema = z.object({
  url: z.string().describe("The link to paste into the LTI platform's Dynamic Registration"),
  expiresAt: z.string().describe('When the link stops working, unless a platform opened it before'),
});

export const createConnectionBodySchema = z.object({
  federation: federationKeySchema,
  name: validNameSchema.describe("The institution's name, as the federation's metadata lists it"),
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

export const updateConnectionBodySchema = createConnectionBodySchema.omit({ federation: true }).partial();
