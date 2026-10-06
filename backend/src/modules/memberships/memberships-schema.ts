import { z } from '@hono/zod-openapi';
import { recordFromKeys, roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import {
  channelEntityTypeSchema,
  includeQuerySchema,
  paginationQuerySchema,
  refineWithType,
  validEmailSchema,
  validIdSchema,
  validUuidSchema,
} from '#/schemas';
import { nullableUserMinimalBaseSchema } from '#/schemas/minimal-base';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { mockInactiveMembershipResponse, mockMembershipBase, mockMembershipResponse } from './memberships-mocks';

const entityRoleSchema = z.enum(roles.all);

const membershipSchema = z
  .object({
    ...createSelectSchema(membershipsTable).shape,
    // Override enum columns with explicit schemas to preserve literal types
    role: entityRoleSchema,
    channelType: channelEntityTypeSchema,
  })
  .openapi('Membership', {
    description: "A user's membership in a channel entity, including role and activity data.",
    example: mockMembershipResponse(),
    'x-tags': schemaTags('data', 'memberships', 'cella'),
  });

export const inactiveMembershipSchema = z
  .object({
    ...createSelectSchema(inactiveMembershipsTable).shape,
    role: entityRoleSchema,
    channelType: channelEntityTypeSchema,
    createdBy: nullableUserMinimalBaseSchema,
  })
  .openapi('InactiveMembership', {
    description:
      "An invitation to join a channel that is not accepted yet: the invited email, the role and who invited. It becomes a membership once accepted; the signed-in user's invitations list it with the channel it is for.",
    example: mockInactiveMembershipResponse(),
    'x-tags': schemaTags('data', 'memberships', 'cella'),
  });

export const membershipBaseSchema = membershipSchema
  .omit({ createdAt: true, createdBy: true, updatedAt: true, updatedBy: true })
  .openapi('MembershipBase', {
    description:
      "A user's membership in a channel without its audit fields: the role it grants, plus the member's own archive, mute and menu order. Returned for the signed-in user's own memberships, and as `included.membership` on a channel they belong to.",
    example: mockMembershipBase(),
    'x-tags': schemaTags('base', 'memberships', 'cella'),
  });

/** Archive, mute and menu order: each member's own view of a channel, never set or shown for anyone else. */
export const personalViewKeys = ['archived', 'muted', 'displayOrder'] as const;
export type PersonalViewKey = (typeof personalViewKeys)[number];
const personalViewMask = recordFromKeys(personalViewKeys, () => true as const);
const optionalPersonalView = membershipBaseSchema.pick(personalViewMask).partial().shape;

/**
 * A membership in a response that may be about another member (the members list, the memberships an invitation
 * creates): archive, mute and menu order are each member's own view, so they come with the caller's own row only.
 */
export const memberMembershipSchema = membershipBaseSchema.omit(personalViewMask).extend(optionalPersonalView);

/** An updated membership with its audit fields; archive, mute and menu order as in `memberMembershipSchema`. */
export const updatedMembershipSchema = membershipSchema.omit(personalViewMask).extend(optionalPersonalView);

export const membershipCreateBodySchema = z.object({ emails: validEmailSchema.array().min(1).max(50), role: membershipSchema.shape.role });

export const membershipUpdateBodySchema = z
  .object({ role: membershipSchema.shape.role.optional(), ...optionalPersonalView })
  // With no field to change, the write would only stamp the caller on the row.
  .superRefine(refineWithType((body) => Object.values(body).some((value) => value !== undefined), 'invalid_request'));

export const memberListQuerySchema = paginationQuerySchema.extend({
  entityId: validIdSchema,
  entityType: channelEntityTypeSchema,
  // lastPostedAt sorts by the member's latest product row in the viewed channel; default is recent activity
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt', 'lastPostedAt']).default('lastSeenAt'),
  role: z.enum(roles.all).optional(),
  // Opt-in per-member insight counts (member-counts.ts), mirroring the channel lists' include=counts
  include: includeQuerySchema,
  userIds: z
    .string()
    .transform((value) => value.split(',').map((id) => id.trim()))
    .pipe(validUuidSchema.array().min(1).max(50))
    .optional(),
});

export const pendingMembershipListQuerySchema = paginationQuerySchema.extend({
  entityId: validIdSchema,
  entityType: channelEntityTypeSchema,
  sort: z.enum(['createdAt']).default('createdAt'),
});

/** An invitation as the channel sees it: nothing here tells whether an account holds the invited address. */
export const pendingMembershipSchema = z.object({
  id: z.string(),
  /** The address the invitation went to. */
  email: userBaseSchema.shape.email,
  role: membershipSchema.shape.role.nullable(),
  createdAt: membershipSchema.shape.createdAt,
  createdBy: nullableUserMinimalBaseSchema,
});
