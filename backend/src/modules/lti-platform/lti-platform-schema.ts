import { z } from '@hono/zod-openapi';
import { accessScopes, appConfig } from 'shared';
import { pageSizeCap } from 'shared/sync-pace';
import { schemaTags } from '#/core/openapi-helpers';
import { maxLength } from '#/db/utils/constraints';
import { isFetchableUrl } from '#/lib/guarded-fetch';
import { ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { ltiTabChannelTypes, ltiTabClosures } from '#/modules/lti-platform/helpers/context-channel';
import { ltiReleasableFields } from '#/modules/lti-platform/lti-installations-db';
import { mockLtiInstallationResponse, mockLtiResourceLinkResponse } from '#/modules/lti-platform/lti-platform-mocks';
import { ltiAudiences } from '#/modules/lti-platform/lti-resource-links-db';
import { serviceAccountStatuses } from '#/modules/service-accounts/service-accounts-db';
import {
  channelEntityTypeSchema,
  channelRefSchema,
  maxPageSizeSchema,
  orderByQuerySchema,
  pageQuerySchema,
  tenantOrgParamSchema,
  validIdSchema,
  validNameSchema,
  validUuidSchema,
} from '#/schemas';
import { boundedRecord } from '#/schemas/common-schemas';
import { auditShape } from '#/schemas/entity-base';

/** An address an LTI tool gives: HTTPS, or plain HTTP in development and test. */
const ltiToolUrlSchema = z.string().max(maxLength.url).refine(isFetchableUrl);

/** A page about the LTI tool that the platform links (section 2.2.1): kept when it is an HTTPS address, else dropped. */
const ltiToolPageSchema = z
  .string()
  .max(maxLength.url)
  .refine((address) => URL.canParse(address) && new URL(address).protocol === 'https:')
  .optional()
  .catch(undefined);

const customParametersSchema = boundedRecord(z.string().max(maxLength.field), 50);

/** An LTI tool describes itself in a few paragraphs at most. */
const descriptionMaxLength = 2000;

/** One message an LTI tool registers for (LTI Dynamic Registration 1.0, section 2.2.4). */
const ltiToolMessageSchema = z.object({
  type: z.string().max(maxLength.field),
  target_link_uri: ltiToolUrlSchema.optional(),
  label: z.string().max(maxLength.field).optional(),
  icon_uri: ltiToolUrlSchema.optional(),
  custom_parameters: customParametersSchema.optional(),
  placements: z.array(z.string().max(maxLength.field)).max(20).optional(),
  roles: z.array(z.string().max(maxLength.url)).max(50).optional(),
});

/**
 * An LTI tool's own configuration in a registration request, in the spec's member names (section 2.2.2); a requested
 * `deployment_id` is dropped, since the platform names the installation. Stored as the platform records it.
 */
const ltiToolConfigSchema = z.object({
  domain: z.string().min(1).max(maxLength.field),
  secondary_domains: z.array(z.string().min(1).max(maxLength.field)).max(20).optional(),
  target_link_uri: ltiToolUrlSchema,
  custom_parameters: customParametersSchema.optional(),
  description: z.string().max(descriptionMaxLength).optional(),
  // Empty or left out: support for the resource link launch is implicit (section 2.2.3).
  messages: z.array(ltiToolMessageSchema).max(20).default([]),
  claims: z.array(z.string().max(maxLength.field)).max(50),
});

export type LtiToolConfig = z.infer<typeof ltiToolConfigSchema>;

/** A list of values that includes `required` and may hold others (section 2.2.1). */
const includingSchema = (required: string) =>
  z
    .array(z.string().max(maxLength.field))
    .max(10)
    .refine((values) => values.includes(required));

/**
 * An LTI tool's registration request (LTI Dynamic Registration 1.0, section 2.2). `response_types` holds `id_token`
 * and `grant_types` holds `implicit`, beside any others, of which the platform records what it uses. Refused: client
 * authentication other than `private_key_jwt`, an ID token signed other than RS256. Unknown members are dropped.
 */
export const ltiToolRegistrationRequestSchema = z.object({
  application_type: z.literal('web'),
  grant_types: includingSchema('implicit'),
  response_types: includingSchema('id_token'),
  redirect_uris: z.array(ltiToolUrlSchema).min(1).max(20),
  initiate_login_uri: ltiToolUrlSchema,
  client_name: validNameSchema,
  jwks_uri: ltiToolUrlSchema,
  logo_uri: ltiToolUrlSchema.optional(),
  client_uri: ltiToolPageSchema,
  tos_uri: ltiToolPageSchema,
  policy_uri: ltiToolPageSchema,
  token_endpoint_auth_method: z.literal('private_key_jwt'),
  id_token_signed_response_alg: z.literal('RS256').optional(),
  scope: z.string().max(maxLength.url).optional(),
  [ltiToolConfigurationMember]: ltiToolConfigSchema,
});

export type LtiToolRegistrationRequest = z.infer<typeof ltiToolRegistrationRequestSchema>;

export const startLtiToolRegistrationBodySchema = z.object({
  registrationUrl: z
    .string()
    .max(maxLength.url)
    .refine(isFetchableUrl)
    .describe("The LTI tool's registration address, which its Dynamic Registration instructions give"),
});

export const ltiToolRegistrationStartSchema = z.object({
  url: z.string().describe("The address to open: the LTI tool's registration address with the platform's configuration and a one-use token"),
  expiresAt: z.string().describe('When the token stops working, unless the LTI tool registered before'),
});

const grantedScopesSchema = z
  .array(z.enum(accessScopes.all))
  .max(accessScopes.all.length)
  .describe("The access scopes the installation's own tokens may carry, each one the LTI tool asked for; empty or left out grants none");

const channelTypesSchema = z
  .array(z.enum(ltiTabChannelTypes))
  .max(ltiTabChannelTypes.length)
  .describe(
    'The channel types it may get a tab in, of those that hold LTI tabs: a type the app makes an LTI context, and the organization; empty or left out allows none',
  );

export const approveLtiInstallationBodySchema = z.object({
  releasedFields: z
    .array(z.enum(ltiReleasableFields))
    .max(ltiReleasableFields.length)
    .describe('The personal fields a launch and a member row may carry, each one the LTI tool asked for; empty releases none'),
  grantedScopes: grantedScopesSchema.optional(),
  channelTypes: channelTypesSchema.optional(),
});

export const updateLtiInstallationBodySchema = z.object({
  grantedScopes: grantedScopesSchema.optional(),
  channelTypes: channelTypesSchema
    .optional()
    .describe(
      'Replaces the channel types it may get a tab in; its tabs in a type taken away stay as they are and stop opening until it is allowed again',
    ),
});

/** The path of one LTI installation in its organization. */
export const ltiInstallationParamSchema = tenantOrgParamSchema.extend({ ltiInstallationId: validIdSchema });

export const ltiInstallationSchema = z
  .object({
    id: z.string().describe('The installation: its service account, and the `deployment_id` the LTI tool knows it by'),
    clientId: z.string().describe("The `client_id` of the LTI tool's registration"),
    name: z.string(),
    logoUri: z.string().nullable(),
    domain: z.string().describe('The domain the LTI tool names itself by: a label it picks, which its addresses need not lie on'),
    launchOrigins: z
      .array(z.string())
      .describe("The distinct origins the LTI tool's launches go to: its login initiation, redirect and target addresses. What an approval trusts"),
    keySetOrigin: z
      .string()
      .describe("The origin of the LTI tool's key set: whoever serves keys there gets the installation's tokens. What an approval trusts too"),
    description: z.string().nullable(),
    clientUri: z.string().nullable().describe("The LTI tool's home page, an HTTPS address it named; null when it named none"),
    tosUri: z.string().nullable().describe('Its terms of service, an HTTPS address it named; null when it named none'),
    policyUri: z.string().nullable().describe('Its privacy policy, an HTTPS address it named; null when it named none'),
    claims: z.array(z.string()).describe('The claims the LTI tool asked for that the platform can release'),
    requestedFields: z.array(z.enum(ltiReleasableFields)).describe('The personal fields those claims carry: what an approval may release'),
    releasedFields: z.array(z.enum(ltiReleasableFields)),
    requestedScopes: z
      .array(z.enum(accessScopes.all))
      .describe('The access scopes the LTI tool asked for in its registration, of those the platform knows: what an admin may grant'),
    grantedScopes: z
      .array(z.enum(accessScopes.all))
      .describe("The access scopes an admin granted: the most the installation's own tokens carry, for the channels it is placed in"),
    channelTypes: z
      .array(z.enum(ltiTabChannelTypes))
      .describe('The channel types an admin allowed it a tab in: only there a channel switches its tab on'),
    status: z.enum(serviceAccountStatuses).describe('`pending` until an admin approves it, or rejects it by deleting it'),
    approvedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
    ...auditShape,
  })
  .openapi('LtiInstallation', {
    description:
      'An LTI tool installed in the organization: the registration it made by LTI Dynamic Registration, private to the tenant, and the service account it acts as. It waits for an organization admin, who approves it with the personal fields its launches may carry, the access scopes its own tokens may carry and the channel types it may get a tab in, or rejects it, which deletes it. An approved one is disabled and re-enabled as a service account.',
    example: mockLtiInstallationResponse(),
    'x-tags': schemaTags('data', 'lti-platform', 'cella'),
  });

/** The path of one resource link in its organization. */
export const ltiResourceLinkParamSchema = tenantOrgParamSchema.extend({ ltiResourceLinkId: validIdSchema });

export const listLtiInstallationsQuerySchema = pageQuerySchema.extend({ orderBy: orderByQuerySchema(['createdAt'], 'createdAt desc') });

/** Oldest first by default: the order a channel's tabs of LTI tools follow until the channel arranges them. */
export const listLtiResourceLinksQuerySchema = pageQuerySchema.extend({
  ...channelRefSchema.shape,
  orderBy: orderByQuerySchema(['createdAt'], 'createdAt asc'),
});

/** Why a caller may not place an LTI tool in a channel, or switch its tab on there: the error a write would answer. */
export const ltiTabRefusals = ['lti_installation_disabled', 'lti_channel_type_not_allowed'] as const;

const ltiAudienceSchema = z
  .enum(ltiAudiences)
  .describe(
    'Whom the tab opens for: `members`, the people holding a membership in its channel, whom the LTI tool reads there; `editors`, whoever may update the channel. It bounds who opens the tab, not whom the LTI tool reads',
  );

export const listLtiTabsQuerySchema = pageQuerySchema.extend({
  ...channelRefSchema.shape,
  orderBy: orderByQuerySchema(['createdAt'], 'createdAt asc'),
});

/**
 * An approved LTI tool as a tab of one channel, placed or not, where an admin allowed it in the channel's type; a
 * disabled one, or one not allowed there, only where it has a tab.
 */
export const ltiTabSchema = z.object({
  id: z.string().describe('The LTI installation, which `installationId` places: a channel holds one tab of it'),
  name: z.string(),
  launchOrigins: z
    .array(z.string())
    .describe(
      "The distinct origins the LTI tool's launches go to, which an approval trusts: with `createdAt`, what tells two LTI tools of one name apart",
    ),
  createdAt: z.string().describe('When the LTI tool was added'),
  status: z.enum(serviceAccountStatuses).describe('`active`, or `disabled` while an admin has stopped it: its tabs refuse every launch then'),
  readsMembers: z
    .boolean()
    .describe(
      'Whether its tab here, on, lets it read who is in the channel: an admin granted it reading members, the channel is an LTI context, and nothing in `refusal` closes the tab',
    ),
  refusal: z
    .enum(ltiTabRefusals)
    .nullable()
    .describe(
      'Why the caller may not place it in the channel or switch its tab on, and why its tab here does not open: a disabled LTI tool, else one an admin did not allow in its type; null when they may',
    ),
  resourceLink: z
    .object({ id: z.string(), title: z.string(), enabled: z.boolean(), audience: ltiAudienceSchema })
    .nullable()
    .describe('The tab once placed, on or off; null for an LTI tool never placed in the channel'),
});

export const listLtiInstallationTabsQuerySchema = pageQuerySchema.extend({
  orderBy: orderByQuerySchema(['createdAt'], 'createdAt asc'),
});

/** A tab of one installation: its resource link and the channel it sits in, whose people it lets the LTI tool read. */
export const ltiInstallationTabSchema = z.object({
  id: z.string().describe('The resource link'),
  channelType: channelEntityTypeSchema,
  channelId: z.string(),
  channelName: z.string(),
  enabled: z.boolean().describe('Whether the tab is on'),
  audience: ltiAudienceSchema,
  closure: z
    .enum(ltiTabClosures)
    .nullable()
    .describe(
      'Why the tab does not open, null when it opens: only a tab that opens lets the LTI tool read who is in its channel, one that is an LTI context',
    ),
  archived: z.boolean().describe('Whether its channel is archived: then its tab does not open, whatever else allows it'),
  isLtiContext: z
    .boolean()
    .describe('Whether its channel is an LTI context: there a tab that opens lets the LTI tool read who is in it, with reading members granted'),
  deletable: z.boolean().describe('Whether the caller may remove it: they may update its channel'),
});

const resourceLinkCustomSchema = customParametersSchema.describe(
  "Custom values its launches send in the `custom` claim, each a string, over the LTI tool's own custom parameters",
);

export const createLtiResourceLinkBodySchema = channelRefSchema.extend({
  installationId: validIdSchema.describe('An approved LTI installation of the tenant'),
  title: validNameSchema,
  custom: resourceLinkCustomSchema.optional(),
  audience: ltiAudienceSchema.optional().describe('Whom the tab opens for; `members` when left out'),
});

export const updateLtiResourceLinkBodySchema = z.object({
  title: validNameSchema.optional(),
  custom: resourceLinkCustomSchema.optional(),
  audience: ltiAudienceSchema.optional(),
  enabled: z
    .boolean()
    .optional()
    .describe("Switches the tab on or off, keeping its id: switching it on takes an active LTI tool allowed in the channel's type"),
});

export const ltiResourceLinkSchema = z
  .object({
    id: z.string().describe('The resource link, and the `resource_link.id` its launches carry'),
    channelType: channelEntityTypeSchema,
    channelId: z.string(),
    installationId: z.string().describe('The LTI installation it launches'),
    title: z.string(),
    custom: z.record(z.string(), z.string()),
    enabled: z
      .boolean()
      .describe(
        'Whether the tab is on: it shows and launches, and lets the LTI tool read who is in its channel if that is an LTI context. Off, it keeps its id',
      ),
    audience: ltiAudienceSchema,
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
    ...auditShape,
  })
  .openapi('LtiResourceLink', {
    description:
      'An LTI tool placed in a channel: a tab that launches the LTI tool in a frame. Its id is the LTI resource link id. It goes with its channel and its installation.',
    example: mockLtiResourceLinkResponse(),
    'x-tags': schemaTags('data', 'lti-platform', 'cella'),
  });

export const ltiLaunchStartSchema = z.object({
  url: z.string().describe('The login initiation page to load in the frame; it holds a one-use launch record'),
  expiresAt: z.string().describe('When the launch record stops working, unless the launch used it before'),
});

/** The path of an LTI context's members: the channel a launch names as its context. */
export const ltiMembershipsParamSchema = tenantOrgParamSchema.extend(channelRefSchema.shape);

/** The fewest members a page holds whatever `limit` asks: a reader of a few hundred stays well inside the burst limit. */
export const minLtiMembersPage = 25;

/** What an NRPS reader appends (section 2.4), and the position the next link carries. */
export const listLtiMembersQuerySchema = z.object({
  role: z
    .string()
    .max(maxLength.url)
    .optional()
    .describe('Lists only the members with this LTI role there: a full URI, or a core context role by its short name, such as `Learner`'),
  limit: maxPageSizeSchema(pageSizeCap)
    .transform((size) => Math.max(size, minLtiMembersPage))
    .describe(
      `Most members one page holds: a hint. Absent or 0 reads ${appConfig.pageSizes.default}; below ${minLtiMembersPage} reads ${minLtiMembersPage}, above ${pageSizeCap} reads ${pageSizeCap}. A page may hold fewer.`,
    ),
  after: validUuidSchema.optional().describe('Lists the members whose id sorts after this one: the next link carries it'),
  rlid: z.string().max(maxLength.field).optional().describe('Refused: reading the members of one resource link, a tab, is not supported'),
});

/** A member as NRPS lists one (section 2.2); the personal fields are the claims a launch carries, by their names. */
const ltiMemberSchema = z.object({
  user_id: z.string().describe('The person: the id a launch sends as `sub`'),
  roles: z.array(z.string()).describe('Their LTI context roles there, as full URIs: the context roles a launch there would send them'),
  status: z.literal('Active').describe('Every member listed is active'),
  name: z.string().optional().describe('Their name, when released'),
  given_name: z.string().optional().describe('Their given name, when released and they have one'),
  family_name: z.string().optional().describe('Their family name, when released and they have one'),
  email: z.string().optional().describe('Their proven email address, when released and they have one'),
  picture: z.string().optional().describe('The address of their picture, when released and they have one'),
});

/** A page of an LTI context's members, an NRPS membership container (section 2.1). */
export const ltiMembershipContainerSchema = z.object({
  id: z.string().describe('The address this page was read at'),
  context: z
    .object({ id: z.string(), label: z.string(), title: z.string() })
    .describe("The LTI context, as a launch's context claim names it: the channel's id, slug and name"),
  members: z.array(ltiMemberSchema),
});

export const initiateLtiLoginQuerySchema = z.object({ token: z.string().max(maxLength.url).describe('The launch record a launch start answered') });
