import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { meRoutes } from '#/modules/me/me-routes';
import { deleteMyMembershipOp } from '#/modules/me/operations/delete-my-membership';
import { getConnectedAppsOp } from '#/modules/me/operations/get-connected-apps';
import { getMeOp } from '#/modules/me/operations/get-me';
import { getMyAuthOp } from '#/modules/me/operations/get-my-auth';
import { getMyInvitationsOp } from '#/modules/me/operations/get-my-invitations';
import { getUploadTokenOp } from '#/modules/me/operations/get-upload-token';
import { revokeConnectedAppOp } from '#/modules/me/operations/revoke-connected-app';
import { revokeMySessionsOp } from '#/modules/me/operations/revoke-my-sessions';
import { toggleMfaOp } from '#/modules/me/operations/toggle-mfa';
import { updateMeOp } from '#/modules/me/operations/update-me';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { handleMembershipInvitationOp } from '#/modules/memberships/operations/handle-membership-invitation';
import { deleteAccounts } from '#/modules/user/operations/delete-accounts';
import { defaultHook } from '#/utils/default-hook';
import { readListPage, windowOf } from '#/utils/list-page';
import { log } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(meRoutes.getMe, async (ctx) => ctx.json(await getMeOp(ctx), 200));

app.openapi(meRoutes.toggleMfa, async (ctx) => ctx.json(await toggleMfaOp(ctx, ctx.req.valid('json').mfaRequired), 200));

app.openapi(meRoutes.getMyAuth, async (ctx) => ctx.json(await getMyAuthOp(ctx), 200));

app.openapi(meRoutes.listMyInvitations, async (ctx) => {
  const invitations = await getMyInvitationsOp(ctx);
  return ctx.json(await readListPage(ctx, ctx.req.valid('query'), async (page) => windowOf(invitations, page)), 200);
});

app.openapi(meRoutes.acceptInvitation, async (ctx) => {
  return ctx.json(await handleMembershipInvitationOp(ctx, ctx.req.valid('param').invitationId, 'accept'), 200);
});

app.openapi(meRoutes.declineInvitation, async (ctx) => {
  return ctx.json(await handleMembershipInvitationOp(ctx, ctx.req.valid('param').invitationId, 'decline'), 200);
});

app.openapi(meRoutes.revokeMySessions, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const { results, rejectedIds, signedOut } = await revokeMySessionsOp(ctx, ids);
  if (signedOut) deleteAuthCookie(ctx, 'session');
  return ctx.json({ results, rejectedIds }, 200);
});

app.openapi(meRoutes.updateMe, async (ctx) => ctx.json(await updateMeOp(ctx, ctx.req.valid('json')), 200));

app.openapi(meRoutes.deleteMe, async (ctx) => {
  const user = ctx.var.user;
  await deleteAccounts(ctx, { userIds: [user.id], by: user.id });
  deleteAuthCookie(ctx, 'session');
  log.info('User deleted');

  return ctx.body(null, 204);
});

app.openapi(meRoutes.leaveMembership, async (ctx) => {
  const { entityType, entityId } = ctx.req.valid('json');
  await deleteMyMembershipOp(ctx, entityType, entityId);
  return ctx.body(null, 204);
});

app.openapi(meRoutes.getUploadToken, async (ctx) => {
  // Signed upload params are a secret for minutes: no cache keeps them (RFC 9111 §5.2.2.5).
  return ctx.json(await getUploadTokenOp(ctx, ctx.req.valid('query')), 200, { 'Cache-Control': 'no-store' });
});

app.openapi(meRoutes.listMyMemberships, async (ctx) => {
  const memberships = ctx.var.memberships.map(toMembershipBase);
  return ctx.json(await readListPage(ctx, ctx.req.valid('query'), async (page) => windowOf(memberships, page)), 200);
});

app.openapi(meRoutes.listConnectedApps, async (ctx) => {
  const connectedApps = await getConnectedAppsOp(ctx);
  return ctx.json(await readListPage(ctx, ctx.req.valid('query'), async (page) => windowOf(connectedApps, page)), 200);
});

app.openapi(meRoutes.deleteConnectedApp, async (ctx) => {
  await revokeConnectedAppOp(ctx, ctx.req.valid('param').connectedAppId);
  return ctx.body(null, 204);
});

export const meHandlers = app;
