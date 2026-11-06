import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  mockMembershipCheckResponse,
  mockMembershipInviteResponse,
  mockMembershipResponse,
  mockPaginatedMembersResponse,
  mockPaginatedPendingMembershipsResponse,
} from '#/modules/memberships/memberships-mocks';
import {
  invitationParamSchema,
  memberListQuerySchema,
  membershipCheckBodySchema,
  membershipCheckResponseSchema,
  membershipCreateBodySchema,
  membershipInviteResponseSchema,
  membershipParamSchema,
  membershipUpdateBodySchema,
  pendingMembershipListQuerySchema,
  pendingMembershipSchema,
  updatedMembershipSchema,
} from '#/modules/memberships/memberships-schema';
import { memberSchema } from '#/modules/user/user-schema';
import { batchResponseSchema, entityWithTypeSchema, idsBodySchema, paginationSchema, tenantOrgParamSchema } from '#/schemas';

const membershipRoutes = createXRoutes(['memberships', 'cella'], {
  inviteMembers: xRoute({
    method: 'post',
    path: '/memberships/~invite',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [spamLimiter, bulkPointsLimiter],
    summary: 'Invite members',
    description:
      "Invites addresses to a channel entity such as an organization and says per address what happened: a new invitation, the earlier one sent again (a higher role replaces a lower one), an organization member added at once, or a member left out. A declined invitation stays declined for `retention.declinedInvitationHoldDays` and only then opens again. A tenant mails an address at most once a day: an address it mailed within the day gets no mail and no new link, and the link it holds keeps working. Past the tenant's daily invitation mails (`invitationMailsPerDay`) the request answers 429 and changes nothing. A created membership carries muted, archived and display order only when it is the caller's own.",
    request: { params: tenantOrgParamSchema, query: entityWithTypeSchema, body: jsonBody(membershipCreateBodySchema) },
    responses: { 200: json('What happened to each address', membershipInviteResponseSchema, mockMembershipInviteResponse()), ...errors(409) },
  }),
  checkMembershipInvite: xRoute({
    method: 'post',
    path: '/memberships/~check-invite',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Check addresses before inviting',
    description:
      "Says per address what an invite would do, from what the caller already sees: members by their listed address and the channel's own invitations. Writes and sends nothing. Requires update permission on the channel.",
    request: { params: tenantOrgParamSchema, query: entityWithTypeSchema, body: jsonBody(membershipCheckBodySchema) },
    responses: {
      200: json(
        'Invite outcomes\n\nOne outcome per address, judged from the members and invitations the caller can see.',
        membershipCheckResponseSchema,
        mockMembershipCheckResponse(),
      ),
    },
  }),
  batchDeleteMemberships: xRoute({
    method: 'post',
    path: '/memberships/~batch-delete',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Delete memberships',
    description:
      'Deletes the memberships of one or more members of a channel entity, named by their user IDs; the users themselves stay. An ID without a membership in the channel comes back in `rejectedIds`.',
    request: { params: tenantOrgParamSchema, query: entityWithTypeSchema, body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Success', batchResponseSchema()), ...errors(409) },
  }),
  updateMembership: xRoute({
    method: 'patch',
    path: '/memberships/{membershipId}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update membership',
    description:
      "Updates a membership: its role, or the muted, archived or display order status. Send at least one field. Muted, archived and display order are set by the member only, and the response carries them only on the caller's own membership. An archive that sends no display order moves the row to the top of the archived rows, a restore to the bottom of the active ones. A channel type whose menu section sets `archivable: false` cannot be archived. A role change, and any change to another member's membership, requires update permission on the channel.",
    request: { params: membershipParamSchema, body: jsonBody(membershipUpdateBodySchema) },
    responses: { 200: json('Membership updated', updatedMembershipSchema, mockMembershipResponse()), ...errors(409) },
  }),
  listMembers: xRoute({
    method: 'get',
    path: '/members',
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get list of members',
    description:
      'Retrieves members (users) of a channel entity by ID, including their associated membership data. Pass ?include=counts for per-member counts, and ?include=mfa for `mfaRequired`, which only admins of the organization receive.',
    request: { params: tenantOrgParamSchema, query: memberListQuerySchema },
    responses: { 200: json('Members', paginationSchema(memberSchema), mockPaginatedMembersResponse()) },
  }),
  listInvitations: xRoute({
    method: 'get',
    path: '/invitations',
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get list of pending memberships',
    description:
      'Returns the pending invitations of a channel entity, identified by ID, to every user who may read it: the address each went to, its role and its inviter. A row looks the same whether an account holds the address or not.',
    request: { params: tenantOrgParamSchema, query: pendingMembershipListQuerySchema },
    responses: { 200: json('Pending memberships', paginationSchema(pendingMembershipSchema), mockPaginatedPendingMembershipsResponse()) },
  }),
  resendInvitation: xRoute({
    method: 'post',
    path: '/invitations/{invitationId}/~resend',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [spamLimiter, singlePointsLimiter],
    summary: 'Resend pending invitation',
    description:
      "Re-sends the invitation email for a pending membership, named by its own id; an invitation holding a token gets a fresh one, and one held in a draft channel waits for its publish. An address the tenant mailed within the day gets nothing, and the link it holds keeps working. Answers 204 alike for every pending invitation, and 429 past the tenant's daily invitation mails. Requires update permission on the invited channel; the public auth resend endpoint stays for invitees holding an expired token.",
    request: { params: invitationParamSchema },
    responses: { 204: { description: 'Invitation resent' } },
  }),
  deleteInvitation: xRoute({
    method: 'delete',
    path: '/invitations/{invitationId}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Withdraw pending invitation',
    description:
      "Withdraws a pending invitation, named by its own id, with its links, so its seat frees. A declined invitation is the invitee's answer and is not withdrawn. Requires update permission on the invited channel.",
    request: { params: invitationParamSchema },
    responses: { 204: { description: 'Invitation withdrawn' } },
  }),
});

export { membershipRoutes };
