import { z } from '@hono/zod-openapi';
import { recordFromKeys, roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { invitationStatuses, invitationsTable } from '#/modules/memberships/invitations-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { mockInviteeInvitationResponse, mockInviteOutcome, mockMembershipBase } from '#/modules/memberships/memberships-mocks';
import {
  channelEntityTypeSchema,
  csvQuerySchema,
  includeQuerySchema,
  listQuerySchema,
  orderByQuerySchema,
  pageQuerySchema,
  refineWithType,
  tenantOrgParamSchema,
  validEmailSchema,
  validIdSchema,
  validUuidSchema,
} from '#/schemas';
import { actorRefSchema } from '#/schemas/actor-ref';
import { auditShape } from '#/schemas/entity-base';

const entityRoleSchema = z.enum(roles.all);

const membershipSchema = z.object({
  ...createSelectSchema(membershipsTable).shape,
  ...auditShape,
  role: entityRoleSchema,
  channelType: channelEntityTypeSchema,
});

export const inviteeInvitationSchema = z
  .object({
    ...createSelectSchema(invitationsTable).shape,
    ...auditShape,
    role: entityRoleSchema,
    channelType: channelEntityTypeSchema,
    createdBy: actorRefSchema,
  })
  .openapi({
    description:
      "An invitation to join a channel that is not accepted yet: the invited email, the role and who invited. It becomes a membership once accepted; the signed-in user's invitations list it with the channel it is for.",
    example: mockInviteeInvitationResponse(),
  });

export const membershipBaseSchema = membershipSchema
  .omit({ createdAt: true, createdBy: true, updatedAt: true, updatedBy: true })
  .openapi('MembershipBase', {
    description:
      "A user's membership in a channel without its audit fields: the role it grants, plus the member's own hide, mute and menu order. Returned for the signed-in user's own memberships, and as `included.membership` on a channel they belong to.",
    example: mockMembershipBase(),
    'x-tags': schemaTags('embedded', 'memberships', 'cella'),
  });

/** Hide, mute and menu order: each member's own view of a channel, never set or shown for anyone else. */
export const personalViewKeys = ['hidden', 'muted', 'displayOrder'] as const;
export type PersonalViewKey = (typeof personalViewKeys)[number];
const personalViewMask = recordFromKeys(personalViewKeys, () => true as const);
const optionalPersonalView = membershipBaseSchema.pick(personalViewMask).partial().shape;

/**
 * A membership in a response that may be about another member (the members list, the memberships an invitation
 * creates): hide, mute and menu order are each member's own view, so they come with the caller's own row only.
 */
export const memberMembershipSchema = membershipBaseSchema.omit(personalViewMask).extend(optionalPersonalView);

/** An updated membership with its audit fields; hide, mute and menu order as in `memberMembershipSchema`. */
export const updatedMembershipSchema = membershipSchema.omit(personalViewMask).extend(optionalPersonalView);

export const membershipCreateBodySchema = z.object({ emails: validEmailSchema.array().min(1).max(50), role: entityRoleSchema });

export const membershipCheckBodySchema = membershipCreateBodySchema.pick({ emails: true });

const inviteOutcomes = ['invite', 'resend', 'add', 'member', 'declined'] as const;

export const inviteOutcomeSchema = z
  .object({
    email: validEmailSchema,
    outcome: z.enum(inviteOutcomes).openapi({
      description:
        '`invite`: a new invitation. `resend`: the channel invited it before, and the invitation goes out again unless the tenant mailed the address within the day. `add`: a member of the organization, added to the channel at once. `member`: already a member, left out. `declined`: the invitee declined, and the address cannot be invited again before the sweep removes the invitation, `retention.declinedInvitationHoldDays` after the decline.',
    }),
    /** resend, declined: when the channel first invited the address. */
    invitedAt: z.string().optional(),
    /** declined: when the invitee declined. */
    declinedAt: z.string().optional(),
    /** member: the role the member holds, which an invite never changes. */
    role: entityRoleSchema.optional(),
  })
  .openapi('InviteOutcome', {
    description:
      "What an invite does, or would do, with one address, told only from what the inviter already sees: the channel's invitations by address and its members by their listed address. An address an account holds reads as one no account holds.",
    example: mockInviteOutcome(),
    'x-tags': schemaTags('data', 'memberships', 'cella'),
  });

export const membershipCheckResponseSchema = z.object({ outcomes: inviteOutcomeSchema.array() });

export const membershipInviteResponseSchema = z.object({
  /** Memberships of organization members added at once. */
  results: memberMembershipSchema.array(),
  outcomes: inviteOutcomeSchema.array(),
  /** The channel is a draft and the role waits for its publish: the invitations are saved, their emails held. */
  held: z.boolean(),
});

/** The path of one membership in its organization. */
export const membershipParamSchema = tenantOrgParamSchema.extend({ membershipId: validIdSchema });

/** The path of one pending invitation, named by its own id, in its organization. */
export const invitationParamSchema = tenantOrgParamSchema.extend({ invitationId: validIdSchema });

export const membershipUpdateBodySchema = z
  .object({ role: entityRoleSchema.optional(), ...optionalPersonalView })
  // With no field to change, the write would only stamp the caller on the row.
  .superRefine(refineWithType((body) => Object.values(body).some((value) => value !== undefined), 'invalid_request'));

export const memberListQuerySchema = listQuerySchema.extend({
  entityId: validIdSchema,
  entityType: channelEntityTypeSchema,
  /** `lastPostedAt` orders by the member's latest product row in the viewed channel. */
  orderBy: orderByQuerySchema(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt', 'lastPostedAt'], 'lastSeenAt desc'),
  role: entityRoleSchema.optional(),
  /** `counts` adds per-member counts, as `include=counts` does on the channel lists; `mfa` adds `mfaRequired`. */
  include: includeQuerySchema,
  userIds: csvQuerySchema(validUuidSchema),
});

export const invitationListQuerySchema = pageQuerySchema.extend({
  entityId: validIdSchema,
  entityType: channelEntityTypeSchema,
  orderBy: orderByQuerySchema(['createdAt'], 'createdAt desc'),
});

/** An invitation as the channel sees it: nothing here tells whether an account holds the invited address. */
export const invitationSchema = z.object({
  id: z.string(),
  /** The address the invitation went to. */
  email: validEmailSchema,
  role: entityRoleSchema,
  /** `held` waits for its draft channel's publish to mail it; a declined invitation is not listed. */
  status: z.enum(invitationStatuses),
  createdAt: membershipSchema.shape.createdAt,
  /** The last mail; null until the first went out. */
  mailedAt: z.string().nullable(),
  /** When a link in the last email stops working, derived for every row alike; null while no email went out. */
  linkExpiresAt: z.string().nullable(),
  createdBy: actorRefSchema,
});
