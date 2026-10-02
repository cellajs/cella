import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { meRoutes } from '#/modules/me/me-routes';
import { deleteMyMembershipOp } from '#/modules/me/operations/delete-my-membership';
import { getConnectedAppsOp } from '#/modules/me/operations/get-connected-apps';
import { getMeOp } from '#/modules/me/operations/get-me';
import { getMyAuthOp } from '#/modules/me/operations/get-my-auth';
import { getMyInvitationsOp } from '#/modules/me/operations/get-my-invitations';
import { getUploadTokenOp } from '#/modules/me/operations/get-upload-token';
import { getUserSessions } from '#/modules/me/operations/get-user-info';
import { revokeConnectedAppOp } from '#/modules/me/operations/revoke-connected-app';
import { revokeMySessionsOp } from '#/modules/me/operations/revoke-my-sessions';
import { toggleMfaOp } from '#/modules/me/operations/toggle-mfa';
import { updateMeOp } from '#/modules/me/operations/update-me';
import { deleteAccounts } from '#/modules/user/operations/delete-accounts';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(meRoutes.getMe, async (ctx) => {
  const data = await getMeOp(ctx);
  return ctx.json(data, 200);
});

app.openapi(meRoutes.toggleMfa, async (ctx) => {
  const { mfaRequired } = ctx.req.valid('json');
  const data = await toggleMfaOp(ctx, mfaRequired);
  return ctx.json(data, 200);
});

app.openapi(meRoutes.getMyAuth, async (ctx) => {
  const sessions = await getUserSessions(ctx, ctx.var.user.id);
  const data = await getMyAuthOp(ctx, { sessions });
  return ctx.json(data, 200);
});

app.openapi(meRoutes.getMyInvitations, async (ctx) => {
  const data = await getMyInvitationsOp(ctx);
  return ctx.json(data, 200);
});

app.openapi(meRoutes.revokeMySessions, async (ctx) => {
  // The admin acts as the user, never on the user's sessions.
  refuseImpersonation(ctx.var.session);
  const { ids } = ctx.req.valid('json');
  const { data, rejectedIds, signedOut } = await revokeMySessionsOp(ctx, ids);
  if (signedOut) deleteAuthCookie(ctx, 'session');
  return ctx.json({ data, rejectedIds }, 200);
});

app.openapi(meRoutes.updateMe, async (ctx) => {
  const data = await updateMeOp(ctx, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(meRoutes.deleteMe, async (ctx) => {
  const user = ctx.var.user;

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: 'self' } });

  await deleteAccounts(ctx, { userIds: [user.id], by: user.id });
  deleteAuthCookie(ctx, 'session');
  log.info('User deleted');

  return ctx.body(null, 204);
});

app.openapi(meRoutes.deleteMyMembership, async (ctx) => {
  const { entityType, entityId } = ctx.req.valid('query');
  await deleteMyMembershipOp(ctx, entityType, entityId);
  return ctx.body(null, 204);
});

app.openapi(meRoutes.getUploadToken, async (ctx) => {
  const { organizationId, templateId } = ctx.req.valid('query');
  const data = getUploadTokenOp(ctx, { organizationId, templateId });
  return ctx.json(data, 200);
});

app.openapi(meRoutes.getMyMemberships, async (ctx) => {
  const memberships = ctx.var.memberships;

  // Strip createdBy; the rest already matches MembershipBaseModel.
  const items = memberships.map(({ createdBy, ...rest }) => rest);

  return ctx.json({ items }, 200);
});

app.openapi(meRoutes.getConnectedApps, async (ctx) => {
  const data = await getConnectedAppsOp(ctx);
  return ctx.json(data, 200);
});

app.openapi(meRoutes.revokeConnectedApp, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await revokeConnectedAppOp(ctx, id);
  return ctx.json(data, 200);
});

export const meHandlers = app;
