import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import { authMagicLinkRoutes } from '#/modules/auth/magic/magic-routes';
import { tokensTable } from '#/modules/auth/tokens-db';
import { findUserByEmail } from '#/modules/user/user-queries';
import { defaultHook } from '#/utils/default-hook';
import { hashToken } from '#/utils/hash-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { magicLinkEmail } from '../../../../emails';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authMagicLinkRoutes.sendMagicLink, async (ctx) => {
  const { email, redirect } = ctx.req.valid('json');
  const strategy = 'magic';

  // Validated here and re-validated at invoke; invalid input degrades to the default path.
  const redirectPath = isValidRedirectPath(redirect) || null;

  if (!appConfig.enabledAuthStrategies.includes(strategy)) {
    throw new AppError(400, 'forbidden_strategy', 'error', { meta: { strategy } });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await findUserByEmail(ctx, { email: normalizedEmail });

  let user: { id: string; name: string; language: string };

  if (!existingUser) {
    // If self-registration is disabled, return 204 to prevent email enumeration
    if (!appConfig.has.selfRegistration) {
      log.info('Magic link requested for unknown email', { email: normalizedEmail });
      return ctx.body(null, 204);
    }

    const slug = slugFromEmail(normalizedEmail);
    user = await handleCreateUser(
      { var: { db } },
      {
        newUser: { email: normalizedEmail, slug, name: slug, firstName: slug },
        emailVerified: false,
      },
    );
    log.info('User created via magic link sign-up', { userId: user.id });
  } else {
    user = existingUser;
  }

  await db.delete(tokensTable).where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, 'magic')));

  const newToken = nanoid(40);
  const hashedToken = hashToken(newToken);

  // Create token row with 15-minute expiry
  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      secret: hashedToken,
      type: 'magic',
      userId: user.id,
      email: normalizedEmail,
      createdBy: user.id,
      redirectPath,
      expiresAt: createDate(new TimeSpan(15, 'm')),
    })
    .returning();

  const magicLinkUrl = new URL(`${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${newToken}`);

  const staticProps = { magicLinkUrl: magicLinkUrl.toString(), name: user.name, isNewUser: !existingUser };
  const recipients = [{ email: normalizedEmail, lng: user.language }];

  mailer.prepareEmails(magicLinkEmail, staticProps, recipients);

  if (appConfig.mode === 'development') {
    console.info(`[magic-link] ${normalizedEmail} ${magicLinkUrl.toString()}`);
  }

  log.info('Magic link email sent', { userId: user.id });

  return ctx.body(null, 204);
});

export const authMagicLinkHandlers = app;
