import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/me/me-module';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { validatePasskey } from '#/modules/auth/passkeys/helpers/passkey';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import { validateTOTP } from '#/modules/auth/totps/helpers/totps';
import { getUserSessions } from '#/modules/me/helpers/get-user-info';
import { deleteSessionsByIds, deleteUser, findUserById, updateUserMfa } from '#/modules/me/me-queries';
import { meRoutes } from '#/modules/me/me-routes';
import { deleteMyMembershipOp } from '#/modules/me/operations/delete-my-membership';
import { getMeOp } from '#/modules/me/operations/get-me';
import { getMyAuthOp } from '#/modules/me/operations/get-my-auth';
import { getMyInvitationsOp } from '#/modules/me/operations/get-my-invitations';
import { getUploadTokenOp } from '#/modules/me/operations/get-upload-token';
import { unsubscribeMeOp } from '#/modules/me/operations/unsubscribe-me';
import { updateMeOp } from '#/modules/me/operations/update-me';
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

  // Determine which MFA strategy user is using
  const strategy: Extract<AuthStrategy, 'passkey' | 'totp'> = passkeyData ? 'passkey' : 'totp';

  try {
    // --- Passkey verification ---
    if (passkeyData) await validatePasskey(ctx, { ...passkeyData, userId: user.id });

    // --- TOTP verification ---
    if (totpCode) await validateTOTP({ code: totpCode, userId: user.id });
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Wrap unexpected errors in AppError for consistent error handling
    throw new AppError(500, 'invalid_credentials', 'error', {
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }

  // Update MFA flag and invalidate sessions atomically
  const updatedUser = await baseDb.transaction(async (tx) => {
    return updateUserMfa({ var: { ...ctx.var, db: tx } }, { mfaRequired });
  });

  invalidateCache.user(user.id);

  if (updatedUser.mfaRequired) {
    // Clear session cookie to enforce fresh login
    deleteAuthCookie(ctx, 'session');

    // Establish a new session after MFA verification
    await setUserSession(ctx, user, strategy, 'mfa');
  }

  // Notify user about MFA status change
  sendAccountSecurityEmail(user, mfaRequired ? 'mfa-enabled' : 'mfa-disabled');

  // Re-select with userSelect to include activity timestamps (subqueries from user_counters table)
  const userWithActivity = await findUserById(ctx);

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

app.openapi(meRoutes.deleteMySessions, async (ctx) => {
  const user = ctx.var.user;

  const { ids } = ctx.req.valid('json');

  const sessionIds = Array.isArray(ids) ? ids : [ids];
  const { sessionToken } = await getParsedSessionCookie(ctx);
  const { session: currentSession } = await validateSession(sessionToken);

  try {
    // Clear auth cookie if user deletes their current session
    if (currentSession && sessionIds.includes(currentSession.id)) deleteAuthCookie(ctx, 'session');

    const deleted = await deleteSessionsByIds(ctx, { sessionIds });

    invalidateCache.user(user.id);

    const deletedIds = deleted.map((s) => s.id);
    const rejectedIds = sessionIds.filter((id) => !deletedIds.includes(id));

    return ctx.json({ data: [] as never[], rejectedIds }, 200);
  } catch {
    return ctx.json({ data: [] as never[], rejectedIds: sessionIds }, 200);
  }
});

app.openapi(meRoutes.updateMe, async (ctx) => {
  const data = await updateMeOp(ctx, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(meRoutes.deleteMe, async (ctx) => {
  const user = ctx.var.user;

  // Check if user exists
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: 'self' } });

  // CASCADE SET NULL on createdBy/updatedBy propagates to product entities.
  await deleteUser(ctx);

  invalidateCache.user(user.id);
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
  const { public: isPublic, organizationId, templateId } = ctx.req.valid('query');
  const data = getUploadTokenOp(ctx, { isPublic, organizationId, templateId });
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

export const meHandlers = app;
