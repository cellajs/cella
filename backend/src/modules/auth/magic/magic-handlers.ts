import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { hasPendingInvitation } from '#/modules/auth/auth-queries';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { handleMagicLink } from '#/modules/auth/general/helpers/handle-magic';
import {
  findOpenableMagicLink,
  maskEmail,
  rememberMagicLinkRequest,
} from '#/modules/auth/magic/helpers/magic-link-browser';
import { claimMagicLinkOwner } from '#/modules/auth/magic/helpers/magic-sign-up';
import { authMagicLinkRoutes } from '#/modules/auth/magic/magic-routes';
import { invokeToken, issueToken } from '#/modules/auth/tokens/token-lifecycle';
import { findUserByEmail } from '#/modules/user/user-queries';
import { defaultHook } from '#/utils/default-hook';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { magicLinkEmail } from '../../../../emails';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authMagicLinkRoutes.sendMagicLink, async (ctx) => {
  const { email, redirect } = ctx.req.valid('json');

  // Validated here and re-validated at invoke; invalid input degrades to the default path.
  const redirectPath = isValidRedirectPath(redirect) || null;

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });

  if (!existingUser) {
    // Registration is closed to the public, but an invited address may still sign up. Anyone else gets the same 204
    // as a real request, to prevent email enumeration.
    const mayRegister = appConfig.has.selfRegistration || (await hasPendingInvitation(ctx, { email: normalizedEmail }));
    if (!mayRegister) {
      log.info('Magic link requested for unknown email', { email: normalizedEmail });
      await rememberMagicLinkRequest(ctx, generateId());
      return ctx.body(null, 204);
    }
  }

  // A sign-up link names no user: asking for it proves nothing about the address, so the account is created when the
  // link is clicked (claimMagicLinkOwner).
  const userId = existingUser?.id ?? null;
  const { token: tokenRecord, rawToken } = await issueToken(
    { var: { db } },
    { type: 'magic', userId, email: normalizedEmail, createdBy: userId, redirectPath },
  );

  // Opening the link in this browser signs in directly; elsewhere it asks for a confirmation first.
  await rememberMagicLinkRequest(ctx, tokenRecord.id);

  const magicLinkUrl = new URL(`${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${rawToken}`);

  const staticProps = {
    magicLinkUrl: magicLinkUrl.toString(),
    name: existingUser?.name ?? slugFromEmail(normalizedEmail),
    isNewUser: !existingUser,
  };
  const recipients = [{ email: normalizedEmail, lng: existingUser?.language ?? appConfig.defaultLanguage }];

  mailer.prepareEmails(magicLinkEmail, staticProps, recipients);

  if (appConfig.mode === 'development') {
    console.info(`[magic-link] ${normalizedEmail} ${magicLinkUrl.toString()}`);
  }

  log.info('Magic link email sent', { userId, signUp: !existingUser });

  return ctx.body(null, 204);
});

app.openapi(authMagicLinkRoutes.getPendingMagicLink, async (ctx) => {
  const rawToken = await getAuthCookie(ctx, 'magic-pending');
  if (!rawToken) throw new AppError(401, 'magic_expired', 'warn');

  const token = await findOpenableMagicLink(rawToken);
  return ctx.json({ email: maskEmail(token.email) }, 200);
});

app.openapi(authMagicLinkRoutes.confirmMagicLink, async (ctx) => {
  try {
    const rawToken = await getAuthCookie(ctx, 'magic-pending');
    if (!rawToken) throw new AppError(401, 'magic_expired', 'warn');

    // Redeemed like opening the link in its own browser, including the refusal while signed in as someone else.
    const tokenRecord = await invokeToken(ctx, { type: 'magic', rawToken, claimOwner: claimMagicLinkOwner });
    deleteAuthCookie(ctx, 'magic-pending');

    return handleMagicLink(ctx, tokenRecord);
  } catch (err) {
    if (err instanceof AppError) {
      throw new AppError(err.status, err.type as ErrorKey, err.severity, {
        willRedirect: appConfig.mode !== 'test',
        meta: { ...err.meta, errorPagePath: '/auth/error' },
      });
    }
    throw err;
  }
});

export const authMagicLinkHandlers = app;
