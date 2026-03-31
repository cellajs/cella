import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq, isNull } from 'drizzle-orm';
import type { EnabledOAuthProvider } from 'shared';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { AuthStrategy } from '#/db/schema/sessions';
import { env } from '#/env';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { getParams, getSignature } from '#/lib/transloadit';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { validatePasskey } from '#/modules/auth/passkeys/helpers/passkey';
import { validateTOTP } from '#/modules/auth/totps/helpers/totps';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { resolveEntity } from '#/modules/entities/helpers/resolve-entity';
import { makeContextEntityBaseSelect } from '#/modules/entities/helpers/select';
import { getAuthInfo, getUserSessions } from '#/modules/me/helpers/get-user-info';
import {
  deleteMyMembership,
  deleteSessionsByIds,
  deleteUser,
  findUserById,
  findUserByUnsubscribeToken,
  type UpdateMeOpts,
  updateMe,
  updateNewsletter,
  updateUserMfa,
  upsertLastStarted,
} from '#/modules/me/me-queries';
import meRoutes from '#/modules/me/me-routes';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { entityTables } from '#/table-config';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { verifyUnsubscribeToken } from '#/utils/unsubscribe-token';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// Route handlers
// ============================================

/**
 * Get me
 */
app.openapi(meRoutes.getMe, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;

  // Update last visit date in user_counters table (avoids CDC noise on users table)
  const lastStartedAt = getIsoDate();
  await upsertLastStarted(db, { userId: user.id, lastStartedAt });

  // Re-select with userSelect to include activity timestamps (subqueries from user_counters table)
  const userWithActivity = await findUserById(db, { userId: user.id });

  return ctx.json({ user: userWithActivity, isSystemAdmin }, 200);
});

/**
 * Toggle MFA require for me auth
 */
app.openapi(meRoutes.toggleMfa, async (ctx) => {
  const db = ctx.var.db;
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
    return updateUserMfa(tx, { userId: user.id, mfaRequired });
  });

  invalidateCache.user(user.id);

  if (updatedUser.mfaRequired) {
    // Clear session cookie to enforce fresh login
    deleteAuthCookie(ctx, 'session');

    // Establish a new session after MFA verification
    await setUserSession(ctx, user, strategy, 'mfa');
  }

  // Notify user about MFA status change
  sendAccountSecurityEmail(ctx, user, mfaRequired ? 'mfa-enabled' : 'mfa-disabled');

  // Re-select with userSelect to include activity timestamps (subqueries from user_counters table)
  const userWithActivity = await findUserById(db, { userId: user.id });

  return ctx.json(userWithActivity, 200);
});

/**
 * Get my auth data
 */
app.openapi(meRoutes.getMyAuth, async (ctx) => {
  const user = ctx.var.user;
  const db = ctx.var.db;

  // Get auth info + sessions in parallel
  const [authInfo, sessions] = await Promise.all([getAuthInfo(db, user.id), getUserSessions(ctx, user.id)]);

  const { oauth, ...restInfo } = authInfo;
  // Filter only providers that are enabled in appConfig
  const enabledOAuth = oauth
    .map(({ provider }) => provider)
    .filter((provider): provider is EnabledOAuthProvider =>
      appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider),
    );

  return ctx.json({ ...restInfo, enabledOAuth, sessions }, 200);
});

/**
 * Get my invitations - a list with a combination of pending membership and entity data
 */
app.openapi(meRoutes.getMyInvitations, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  // crossTenantGuard sets user RLS context (app.user_id)
  // select_own_policy on inactive_memberships allows reading own invitations
  const pendingInvites = await Promise.all(
    appConfig.contextEntityTypes.map((entityType) => {
      const entityTable = entityTables[entityType];

      const contextEntityBaseSelect = makeContextEntityBaseSelect(entityType);

      return db
        .select({
          entity: contextEntityBaseSelect,
          inactiveMembership: inactiveMembershipsTable,
        })
        .from(inactiveMembershipsTable)
        .innerJoin(entityTable, eq(entityTable.id, inactiveMembershipsTable.contextId))
        .where(
          and(
            eq(inactiveMembershipsTable.contextType, entityType),
            eq(inactiveMembershipsTable.userId, user.id),
            isNull(inactiveMembershipsTable.rejectedAt),
          ),
        );
    }),
  );

  const rawItems = pendingInvites.flat();

  // Populate createdBy on inactiveMemberships with user objects
  const allMemberships = rawItems.map((item) => item.inactiveMembership);
  const populatedMemberships = await withAuditUsers(ctx, allMemberships);
  const items = rawItems.map((item, i) => ({
    ...item,
    inactiveMembership: populatedMemberships[i],
  }));
  const total = items.length;

  return ctx.json({ items, total }, 200);
});

/**
 * Terminate one or more of my sessions
 */
app.openapi(meRoutes.deleteMySessions, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  const { ids } = ctx.req.valid('json');

  const sessionIds = Array.isArray(ids) ? ids : [ids];
  const { sessionToken } = await getParsedSessionCookie(ctx);
  const { session: currentSession } = await validateSession(sessionToken);

  try {
    // Clear auth cookie if user deletes their current session
    if (currentSession && sessionIds.includes(currentSession.id)) deleteAuthCookie(ctx, 'session');

    const deleted = await deleteSessionsByIds(db, { sessionIds, userId: user.id });

    invalidateCache.user(user.id);

    const deletedIds = deleted.map((s) => s.id);
    const rejectedIds = sessionIds.filter((id) => !deletedIds.includes(id));

    return ctx.json({ data: [] as never[], rejectedIds }, 200);
  } catch {
    return ctx.json({ data: [] as never[], rejectedIds: sessionIds }, 200);
  }
});

/**
 * Update current user (me)
 */
app.openapi(meRoutes.updateMe, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: 'self' } });

  const { userFlags, ...passedUpdates } = ctx.req.valid('json');

  const { slug, firstName, lastName } = passedUpdates;

  if (slug && slug !== user.slug) {
    const slugAvailable = await checkSlugAvailable(db, slug, 'user');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
  }
  // if userFlags is provided, merge it
  const updateData = {
    ...passedUpdates,
    ...(userFlags && { userFlags }),
    ...((firstName || lastName) && { name: [firstName, lastName].filter(Boolean).join(' ') }),
    updatedAt: getIsoDate(),
    updatedBy: user.id,
  };

  await updateMe(db, { userId: user.id, values: updateData as UpdateMeOpts['values'] });
  invalidateCache.user(user.id);

  // Re-select with userSelect to include activity timestamps (subqueries from user_counters table)
  const userWithActivity = await findUserById(db, { userId: user.id });

  return ctx.json(userWithActivity, 200);
});

/**
 * Delete current user (me)
 */
app.openapi(meRoutes.deleteMe, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  // Check if user exists
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: 'self' } });

  // Delete user — CASCADE SET NULL on createdBy/updatedBy propagates to product entities
  await deleteUser(db, { userId: user.id });

  invalidateCache.user(user.id);
  deleteAuthCookie(ctx, 'session');
  logEvent(ctx, 'info', 'User deleted');

  return ctx.body(null, 204);
});

/**
 * Delete one of my entity memberships
 */
app.openapi(meRoutes.deleteMyMembership, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  const { entityType, entityId } = ctx.req.valid('query');

  // Internal resolve: user is leaving their own membership (self-operation, no permission check needed)
  const entity = await resolveEntity(db, entityType, entityId);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Delete membership directly (no RLS needed for context entities)
  await deleteMyMembership(baseDb, { userId: user.id, contextId: entity.id });

  invalidateCache.user(user.id);
  logEvent(ctx, 'info', 'User left entity');

  return ctx.body(null, 204);
});

/**
 * Get upload token
 */
app.openapi(meRoutes.getUploadToken, async (ctx) => {
  const user = ctx.var.user;

  const { public: isPublic, organizationId, templateId } = ctx.req.valid('query');

  // When sharing buckets, prefix S3 keys with bucket name to namespace within the shared bucket
  const bucket = isPublic ? appConfig.s3.publicBucket : appConfig.s3.privateBucket;
  const sub = [appConfig.s3.hasSharedBucket ? bucket : null, organizationId, user.id]
    .filter((part): part is string => typeof part === 'string')
    .join('/');

  // If Transloadit not configured, return response indicating local-only mode
  if (!env.TRANSLOADIT_KEY || !env.TRANSLOADIT_SECRET) {
    return ctx.json({ sub, public: isPublic, s3: !!env.S3_ACCESS_KEY_ID, params: null, signature: null }, 200);
  }

  try {
    const params = getParams(templateId, isPublic, sub);
    const paramsString = JSON.stringify(params);
    const signature = getSignature(paramsString);

    const token = { sub, public: isPublic, s3: !!env.S3_ACCESS_KEY_ID, params, signature };

    return ctx.json(token, 200);
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw new AppError(500, 'auth_key_not_found', 'error', {
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
});

/**
 * Unsubscribe myself by token from receiving newsletters
 */
app.openapi(meRoutes.unsubscribeMe, async (ctx) => {
  const db = ctx.var.db;
  const { token } = ctx.req.valid('query');

  // Check if token exists
  const user = await findUserByUnsubscribeToken(db, { token });

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  // Verify token
  const isValid = verifyUnsubscribeToken(user.email, token);
  if (!isValid) throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user' });

  // Update user
  await updateNewsletter(db, { userId: user.id, newsletter: false });

  const redirectUrl = new URL('/auth/unsubscribed', appConfig.frontendUrl);
  return ctx.redirect(redirectUrl, 302);
});

/**
 * Get all memberships for the current user
 */
app.openapi(meRoutes.getMyMemberships, async (ctx) => {
  const memberships = ctx.var.memberships;

  // Strip createdBy (not in membershipBaseSchema) — the rest already matches MembershipBaseModel
  const items = memberships.map(({ createdBy, ...rest }) => rest);

  return ctx.json({ items }, 200);
});

export { meTag } from '#/modules/me/me-module';
export const meHandlers = app;
