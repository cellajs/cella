import { z } from '@hono/zod-openapi';
import { maxLength } from '#/db/utils/constraints';
import { isFetchableUrl } from '#/lib/guarded-fetch';
import { ltiPlatformConfigurationMember, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { ltiImportIssues } from '#/modules/auth/flows/lti/lti-contexts-db';
import { orderByQuerySchema, pageQuerySchema, validUuidSchema } from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';

/** What a platform opens the registration link with. */
export const ltiRegisterQuerySchema = z.object({
  link: z.string().max(maxLength.field).describe('The one-use registration link an organization admin created'),
  openid_configuration: z.string().max(maxLength.url).describe("The address of the platform's OpenID configuration"),
  registration_token: z.string().max(maxLength.url).optional().describe("The platform's token for the registration request"),
});

/** An LTI id: a person, a deployment, a context or a resource link, at most 255 characters (LTI Core 1.3, section 5). */
export const ltiIdSchema = z.string().min(1).max(255);

/** A profile claim, kept only when it fits a column; a longer or empty one is dropped. */
export const profileClaim = z.string().min(1).max(maxLength.field).optional().catch(undefined);

const platformUrlSchema = z.string().max(maxLength.url).refine(isFetchableUrl);
const memberListSchema = z.array(z.string().max(maxLength.field)).max(100);

/** A platform's OpenID configuration with the members the spec requires; unknown members are dropped. */
export const ltiPlatformConfigurationSchema = z.object({
  issuer: z.string().max(maxLength.field).refine(isFetchableUrl),
  authorization_endpoint: platformUrlSchema,
  registration_endpoint: platformUrlSchema,
  jwks_uri: platformUrlSchema,
  token_endpoint: platformUrlSchema,
  authorization_server: z.string().max(maxLength.url).optional(),
  token_endpoint_auth_methods_supported: memberListSchema,
  token_endpoint_auth_signing_alg_values_supported: memberListSchema,
  scopes_supported: memberListSchema,
  response_types_supported: memberListSchema,
  subject_types_supported: memberListSchema,
  id_token_signing_alg_values_supported: memberListSchema,
  claims_supported: memberListSchema,
  [ltiPlatformConfigurationMember]: z.object({
    product_family_code: z.string().max(maxLength.field),
    version: z.string().max(maxLength.field),
    messages_supported: z.array(z.object({ type: z.string().max(maxLength.field) })).max(100),
  }),
});

export type LtiPlatformConfiguration = z.infer<typeof ltiPlatformConfigurationSchema>;

/** The platform's answer to a registration: the client id it gave the app, and its LTI deployment when it made one. */
export const ltiRegistrationResponseSchema = z.object({
  client_id: z.string().min(1).max(maxLength.field),
  registration_client_uri: platformUrlSchema.optional(),
  [ltiToolConfigurationMember]: z.object({ deployment_id: z.string().min(1).max(maxLength.field).optional() }).optional(),
});

/** An opaque value a platform hands over, such as a login or message hint; Canvas's message hint is a signed token. */
const platformValueSchema = z.string().max(4096).optional();

/** An ID token: a few kilobytes, more with many custom parameters. */
const idTokenSchema = z
  .string()
  .max(32 * 1024)
  .optional();

/**
 * A platform's login initiation (1EdTech Security Framework 1.0, section 5.1.1.1; LTI Core 1.3, section 4.1), as GET
 * query or POST form. Every member is optional here: the login refuses a missing one with its own page.
 */
export const ltiLoginParamsSchema = z.object({
  iss: z.string().max(maxLength.field).optional().describe("The platform's issuer"),
  login_hint: platformValueSchema.describe("The platform's hint of who launches, echoed in the authentication request"),
  target_link_uri: z.string().max(maxLength.url).optional().describe('Where the platform means the launch to land'),
  lti_message_hint: platformValueSchema.describe("The platform's hint of what it launches, echoed in the authentication request"),
  lti_deployment_id: z.string().max(maxLength.field).optional().describe('The LTI deployment the launch comes from'),
  client_id: z.string().max(maxLength.field).optional().describe('The client id the platform gave the app; needed when the issuer holds several'),
  lti_storage_target: z.string().max(maxLength.field).optional().describe('The frame that answers platform storage messages'),
});

/** What a platform posts to the launch address (1EdTech Security Framework 1.0, section 5.1.1.3): an ID token, or an error. */
export const ltiLaunchFormSchema = z.object({
  id_token: idTokenSchema.describe('The signed launch'),
  state: z.string().max(maxLength.url).optional().describe('The state the login sent'),
  error: z.string().max(maxLength.field).optional().describe("The platform's refusal, in place of an ID token"),
  error_description: z.string().max(maxLength.url).optional(),
});

/** What the launch page posts to the finish route: the platform's launch, and the value platform storage held for this frame. */
export const ltiFinishFormSchema = z.object({
  id_token: idTokenSchema,
  state: z.string().max(maxLength.url).optional(),
  storage_value: z.string().max(maxLength.field).optional(),
});

/** The LTI contexts of an organization, the courses launched most recently first by default. */
export const listLtiContextsQuerySchema = pageQuerySchema.extend({
  connectionId: validUuidSchema.optional().describe('Lists the contexts of this LTI connection only'),
  orderBy: orderByQuerySchema(['createdAt'], 'createdAt desc'),
});

export const ltiContextSchema = z.object({
  id: z.string(),
  connectionId: z.string().describe('The LTI connection whose platform launched it'),
  contextId: z.string().describe("The platform's id of the context"),
  label: z.string().nullable().describe("The platform's short name of the context, such as a course code"),
  title: z.string().nullable(),
  channel: channelBaseSchema,
  apiUrl: z.string().nullable().describe("The platform's API that the member import reads, from the last launch that named one; null when none did"),
  importRanAt: z.string().nullable().describe('When the last member import ran; null before the first'),
  importReadCount: z.int().nullable().describe('How many people the last member import read from the platform'),
  importIssue: z
    .enum(ltiImportIssues)
    .nullable()
    .describe(
      "Why the last member import stopped short: the app refused an address the platform names, the platform refused the scope, the token or the member list, a read failed and is tried again or was tried for the last time, the platform listed more people than one import reads, the member limit left people out, or the connection, the organization or the course's channel is not active. Null when it read and wrote everyone.",
    ),
  createdAt: z.string().describe('When the first launch recorded it'),
});
