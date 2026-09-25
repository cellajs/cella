import { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { mfaFactorRules } from '#/modules/auth/general/helpers/mfa';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { verifyPasskeyAssertion } from '#/modules/auth/passkeys/helpers/passkey';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import { verifyTotp } from '#/modules/auth/totps/helpers/totps';
import { getUserSessions } from '#/modules/me/helpers/get-user-info';
import { deleteUser, findCurrentUser, updateUserMfa } from '#/modules/me/me-queries';
import { meRoutes } from '#/modules/me/me-routes';
import { deleteMyMembershipOp } from '#/modules/me/operations/delete-my-membership';
import { getConnectedAppsOp } from '#/modules/me/operations/get-connected-apps';
import { getMeOp } from '#/modules/me/operations/get-me';
import { getMyAuthOp } from '#/modules/me/operations/get-my-auth';
import { getMyInvitationsOp } from '#/modules/me/operations/get-my-invitations';
import { getUploadTokenOp } from '#/modules/me/operations/get-upload-token';
import { revokeConnectedAppOp } from '#/modules/me/operations/revoke-connected-app';
import { revokeMySessionsOp } from '#/modules/me/operations/revoke-my-sessions';
import { unsubscribeMeOp } from '#/modules/me/operations/unsubscribe-me';
import { updateMeOp } from '#/modules/me/operations/update-me';
import { deleteConsentsOfUsers } from '#/modules/oauth-server/oauth-server-queries';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(meRoutes.getMe, async (ctx) => {
  const data = await getMeOp(ctx);
  return ctx.json(data, 200);
});

app.openapi(meRoutes.toggleMfa, async (ctx) => {
  const user = ctx.var.user;

  const { mfaRequired, passkeyData, totpCode } = ctx.req.valid('json');

  // A session alone never changes how the account is protected: the request itself proves a second factor.
  if (!passkeyData && !totpCode) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'second_factor_required' } });
  }

  if (mfaRequired) await mfaFactorRules.assertCanEnable(baseDb, user.id);

  const strategy: Extract<AuthStrategy, 'passkey' | 'totp'> = passkeyData ? 'passkey' : 'totp';

  try {
    if (passkeyData) {
      const assertion = passkeyData as AuthenticationResponseJSON;
      await verifyPasskeyAssertion(ctx, { assertion, purpose: 'authentication', userId: user.id });
    }

    if (totpCode) await verifyTotp(ctx, { user, code: totpCode });
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw new AppError(500, 'invalid_credentials', 'error', {
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }

  // The flag and the sessions it ends change together.
  const updatedUser = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { ...ctx.var, db: tx } };
    const updated = await updateUserMfa(txCtx, { mfaRequired });
    if (updated.mfaRequired) {
      // This browser's session gives way to the mfa session minted below; every other regular session ends.
      await endSessions(txCtx, { userId: user.id, sessionIds: [ctx.var.sessionId], reason: 'replaced', by: user.id });
      await endSessions(txCtx, { userId: user.id, all: true, type: 'regular', reason: 'mfa_enabled', by: user.id });
    }
    return updated;
  });

  invalidateCache.user(user.id);

  if (updatedUser.mfaRequired) {
    // Clear session cookie to enforce fresh login
    deleteAuthCookie(ctx, 'session');

    await setUserSession(ctx, user, strategy, 'mfa');
  }

  sendAccountSecurityEmail(user, mfaRequired ? 'mfa-enabled' : 'mfa-disabled');

  // Re-select to include the user_counters subqueries
  const userWithActivity = await findCurrentUser(ctx);

  return ctx.json(userWithActivity, 200);
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

  // CASCADE SET NULL on createdBy/updatedBy propagates to product entities.
  await deleteUser(ctx);
  await deleteConsentsOfUsers(ctx, { userIds: [user.id] });

  await endSessions(ctx, { userId: user.id, all: true, reason: 'user_deleted', by: user.id });
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

app.openapi(meRoutes.unsubscribeMe, async (ctx) => {
  const { token } = ctx.req.valid('query');
  const redirectUrl = await unsubscribeMeOp(ctx, token);
  return ctx.redirect(redirectUrl, 302);
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
