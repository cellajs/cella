import { z } from '@hono/zod-openapi';
import { maxLength } from '#/db/utils/constraints';
import { isFetchableUrl } from '#/lib/guarded-fetch';

/** The member of a platform's OpenID configuration that describes it as an LTI platform. */
export const ltiPlatformConfigurationMember = 'https://purl.imsglobal.org/spec/lti-platform-configuration';

/** The member of a registration request and its answer that describes the app as an LTI tool. */
export const ltiToolConfigurationMember = 'https://purl.imsglobal.org/spec/lti-tool-configuration';

/** What a platform opens the registration link with. */
export const ltiRegisterQuerySchema = z.object({
  link: z.string().max(maxLength.field).describe('The one-use registration link an organization admin created'),
  openid_configuration: z.string().max(maxLength.url).describe("The address of the platform's OpenID configuration"),
  registration_token: z.string().max(maxLength.url).optional().describe("The platform's token for the registration request"),
});

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

/** The claims of an LTI message (LTI Core 1.3, section 5), by their full names. */
export const ltiClaims = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  toolPlatform: 'https://purl.imsglobal.org/spec/lti/claim/tool_platform',
  launchPresentation: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
} as const;

/** The LIS context types an LTI context may carry (LTI Core 1.3, appendix A.1). */
export const lisContextTypes = {
  courseTemplate: 'http://purl.imsglobal.org/vocab/lis/v2/course#CourseTemplate',
  courseOffering: 'http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering',
  courseSection: 'http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection',
  group: 'http://purl.imsglobal.org/vocab/lis/v2/course#Group',
} as const;

/** The core LIS context roles (LTI Core 1.3, appendix A.2.3), as full URIs: short names are deprecated. */
export const lisContextRoles = {
  administrator: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Administrator',
  contentDeveloper: 'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
  instructor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  learner: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
  mentor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor',
} as const;
