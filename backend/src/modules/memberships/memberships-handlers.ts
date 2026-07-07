import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { membershipRoutes } from '#/modules/memberships/memberships-routes';
import '#/modules/memberships/memberships-module';
import { createMembershipsOp } from '#/modules/memberships/operations/create-memberships';
import { deleteMembershipsOp } from '#/modules/memberships/operations/delete-memberships';
import { getMembersOp } from '#/modules/memberships/operations/get-members';
import { getPendingMembershipsOp } from '#/modules/memberships/operations/get-pending-memberships';
import { handleMembershipInvitationOp } from '#/modules/memberships/operations/handle-membership-invitation';
import { updateMembershipOp } from '#/modules/memberships/operations/update-membership';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(membershipRoutes.createMemberships, async (ctx) => {
  const { emails, role } = ctx.req.valid('json');
  const { entityId, entityType } = ctx.req.valid('query');
  const data = await createMembershipsOp(ctx, { emails, role, entityId, entityType });
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.deleteMemberships, async (ctx) => {
  const { entityType, entityId } = ctx.req.valid('query');
  const { ids } = ctx.req.valid('json');
  const data = await deleteMembershipsOp(ctx, { ids, entityId, entityType });
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.updateMembership, async (ctx) => {
  const { id: membershipId } = ctx.req.valid('param');
  const updates = ctx.req.valid('json');
  const data = await updateMembershipOp(ctx, membershipId, updates);
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.handleMembershipInvitation, async (ctx) => {
  const { id: inactiveMembershipId, acceptOrReject } = ctx.req.valid('param');
  const data = await handleMembershipInvitationOp(ctx, inactiveMembershipId, acceptOrReject);
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.getMembers, async (ctx) => {
  const data = await getMembersOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(membershipRoutes.getPendingMemberships, async (ctx) => {
  const data = await getPendingMembershipsOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

export const membershipHandlers = app;
