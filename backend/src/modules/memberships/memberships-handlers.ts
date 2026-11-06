import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { membershipRoutes } from '#/modules/memberships/memberships-routes';
import { checkInvitesOp } from '#/modules/memberships/operations/check-invites';
import { createMembershipsOp } from '#/modules/memberships/operations/create-memberships';
import { deleteMembershipsOp } from '#/modules/memberships/operations/delete-memberships';
import { getMembersOp } from '#/modules/memberships/operations/get-members';
import { getPendingMembershipsOp } from '#/modules/memberships/operations/get-pending-memberships';
import { resendPendingInvitationOp } from '#/modules/memberships/operations/resend-pending-invitation';
import { updateMembershipOp } from '#/modules/memberships/operations/update-membership';
import { withdrawPendingInvitationOp } from '#/modules/memberships/operations/withdraw-pending-invitation';
import { defaultHook } from '#/utils/default-hook';
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(membershipRoutes.inviteMembers, async (ctx) => {
  const { emails, role } = ctx.req.valid('json');
  const { entityId, entityType } = ctx.req.valid('query');
  const data = await createMembershipsOp(ctx, { emails, role, entityId, entityType });
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.checkMembershipInvite, async (ctx) => {
  const { emails } = ctx.req.valid('json');
  const { entityId, entityType } = ctx.req.valid('query');
  const data = await checkInvitesOp(ctx, { emails, entityId, entityType });
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.batchDeleteMemberships, async (ctx) => {
  const { entityType, entityId } = ctx.req.valid('query');
  const { ids } = ctx.req.valid('json');
  const data = await deleteMembershipsOp(ctx, { userIds: ids, entityId, entityType });
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.updateMembership, async (ctx) => {
  const { membershipId } = ctx.req.valid('param');
  const updates = ctx.req.valid('json');
  const data = await updateMembershipOp(ctx, membershipId, updates);
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.listMembers, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getMembersOp(ctx, query, page)), 200);
});

app.openapi(membershipRoutes.listInvitations, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getPendingMembershipsOp(ctx, query, page)), 200);
});

app.openapi(membershipRoutes.resendInvitation, async (ctx) => {
  const { invitationId } = ctx.req.valid('param');
  await resendPendingInvitationOp(ctx, invitationId);
  return ctx.body(null, 204);
});

app.openapi(membershipRoutes.deleteInvitation, async (ctx) => {
  const { invitationId } = ctx.req.valid('param');
  await withdrawPendingInvitationOp(ctx, invitationId);
  return ctx.body(null, 204);
});

export const membershipHandlers = app;
