import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { membershipRoutes } from '#/modules/memberships/memberships-routes';
import { createMembershipsOp } from '#/modules/memberships/operations/create-memberships';
import { deleteMembershipsOp } from '#/modules/memberships/operations/delete-memberships';
import { getMembersOp } from '#/modules/memberships/operations/get-members';
import { listInvitationsOp } from '#/modules/memberships/operations/list-invitations';
import { checkInvitesOp } from '#/modules/memberships/operations/plan-invites';
import { resendPendingInvitationOp } from '#/modules/memberships/operations/resend-pending-invitation';
import { updateMembershipOp } from '#/modules/memberships/operations/update-membership';
import { withdrawPendingInvitationOp } from '#/modules/memberships/operations/withdraw-pending-invitation';
import { defaultHook } from '#/utils/default-hook';
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(membershipRoutes.inviteMembers, async (ctx) => {
  const { emails, role } = ctx.req.valid('json');
  const { entityId, entityType } = ctx.req.valid('query');
  return ctx.json(await createMembershipsOp(ctx, { emails, role, entityId, entityType }), 200);
});

app.openapi(membershipRoutes.checkMemberInvite, async (ctx) => {
  const { emails } = ctx.req.valid('json');
  const { entityId, entityType } = ctx.req.valid('query');
  return ctx.json(await checkInvitesOp(ctx, { emails, entityId, entityType }), 200);
});

app.openapi(membershipRoutes.batchDeleteMembers, async (ctx) => {
  const { entityType, entityId } = ctx.req.valid('query');
  const { ids } = ctx.req.valid('json');
  return ctx.json(await deleteMembershipsOp(ctx, { userIds: ids, entityId, entityType }), 200);
});

app.openapi(membershipRoutes.updateMembership, async (ctx) => {
  return ctx.json(await updateMembershipOp(ctx, ctx.req.valid('param').membershipId, ctx.req.valid('json')), 200);
});

app.openapi(membershipRoutes.listMembers, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getMembersOp(ctx, query, page)), 200);
});

app.openapi(membershipRoutes.listInvitations, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => listInvitationsOp(ctx, query, page)), 200);
});

app.openapi(membershipRoutes.resendInvitation, async (ctx) => {
  await resendPendingInvitationOp(ctx, ctx.req.valid('param').invitationId);
  return ctx.body(null, 204);
});

app.openapi(membershipRoutes.deleteInvitation, async (ctx) => {
  await withdrawPendingInvitationOp(ctx, ctx.req.valid('param').invitationId);
  return ctx.body(null, 204);
});

export const membershipHandlers = app;
