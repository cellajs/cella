import type { EnabledOauthProvider } from 'config';
import { config } from 'config';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { organizationsTable } from '#/db/schema/organizations';
import { tokensTable } from '#/db/schema/tokens';
import { type InsertUserModel, usersTable } from '#/db/schema/users';
import { entityIdFields } from '#/entity-config';
import { resolveEntity } from '#/lib/entity';
import { errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { insertMembership } from '#/modules/memberships/helpers';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { TimeSpan, createDate } from '#/utils/time-span';
import { checkSlugAvailable } from '../../general/helpers/check-slug';
import { insertOauthAccount } from './oauth';
import { setUserSession } from './session';
import { sendVerificationEmail } from './verify-email';

interface HandleCreateUserProps {
  ctx: Context;
  newUser: Omit<InsertUserModel, 'unsubscribeToken'>;
  redirectUrl?: string | null;
  provider?: { id: EnabledOauthProvider; userId: string };
  tokenId?: string | null;
  emailVerified?: boolean;
}

/**
 * Handles user creation, including password or OAuth-based sign-up.
 * Inserts the user into the database, processes OAuth accounts, and sends verification emails.
 * Sets a user session upon successful sign-up.
 *
 * @param ctx - Request/response context.
 * @param newUser - New user data for registration(InsertUserModel).
 * @param redirectUrl - Optional, URL to redirect the user to after successful sign-up.
 * @param provider - Optional, OAuth provider data for linking the user.
 * @param tokenId - Optional, token ID to associate with the new user.
 * @param emailVerified - Optional, new user email verified.
 * @returns Error response or Redirect response or Response
 */
export const handleCreateUser = async ({ ctx, newUser, redirectUrl, provider, tokenId, emailVerified }: HandleCreateUserProps) => {
  // Check if slug is available
  const slugAvailable = await checkSlugAvailable(newUser.slug);

  try {
    // Insert new user into database
    const userEmail = newUser.email.toLowerCase();
    const [user] = await db
      .insert(usersTable)
      .values({
        slug: slugAvailable ? newUser.slug : `${newUser.slug}-${nanoid(5)}`,
        firstName: newUser.firstName,
        email: userEmail,
        name: newUser.name,
        unsubscribeToken: generateUnsubscribeToken(userEmail),
        language: config.defaultLanguage,
        hashedPassword: newUser.hashedPassword,
      })
      .returning();

    // If a provider is passed, insert oauth account
    if (provider) await insertOauthAccount(user.id, provider.id, provider.userId);

    // If signing up with token, update it with new user id and insert membership if applicable
    if (tokenId) await handleTokenUpdate(user.id, tokenId);
    if (!tokenId) {
      const organizations = await db.select().from(organizationsTable).where(sql`jsonb_array_length(${organizationsTable.emailDomains}::jsonb) > 0`);
      const organization = organizations.find((org) => org.emailDomains.some((domain) => user.email.endsWith(`@${domain}`)));

      if (organization) {
        const [insertedToken] = await db
          .insert(tokensTable)
          .values({
            token: nanoid(40), // unique hashed token
            type: 'domain_invitation' as const,
            email: user.email,
            createdBy: user.id,
            expiresAt: createDate(new TimeSpan(7, 'd')),
            role: 'member' as const,
            userId: user.id,
            entity: 'organization',
            organizationId: organization.id,
          })
          .returning({ tokenId: tokensTable.id, token: tokensTable.token });
        insertMembership({ userId: user.id, role: 'member', entity: organization, tokenId: insertedToken.tokenId });

        if (emailVerified) {
          await db.insert(emailsTable).values({ email: user.email, userId: user.id, verified: true, verifiedAt: getIsoDate() });
          await setUserSession(ctx, user.id, provider?.id || 'password');
          return ctx.redirect(`${config.frontendUrl}/invitation/${insertedToken.token}?tokenId=${insertedToken.tokenId}`, 302);
        }

        sendVerificationEmail(user.id);
        // Redirect to URL if provided
        if (redirectUrl) return ctx.redirect(redirectUrl, 302);
        return ctx.json({ success: true }, 200);
      }
    }

    // If email is not verified, send verification email. Otherwise, create verified email record and  sign in user
    if (!emailVerified) sendVerificationEmail(user.id);
    else {
      await db.insert(emailsTable).values({ email: user.email, userId: user.id, verified: true, verifiedAt: getIsoDate() });
      await setUserSession(ctx, user.id, provider?.id || 'password');
    }

    // Redirect to URL if provided
    if (redirectUrl) return ctx.redirect(redirectUrl, 302);

    // Return
    return ctx.json({ success: true }, 200);
  } catch (error) {
    // If the email already exists, return an error
    if (error instanceof Error && error.message.startsWith('duplicate key')) {
      return errorResponse(ctx, 409, 'email_exists', 'warn');
    }

    if (error instanceof Error) {
      const strategy = provider ? provider.id : 'password';
      const errorMessage = error.message;
      logEvent('Error creating user', { strategy, errorMessage }, 'error');
    }

    throw error;
  }
};

export const handleTokenUpdate = async (userId: string, tokenId: string) => {
  try {
    // Update the token with the new userId
    const [token] = await db.update(tokensTable).set({ userId }).where(eq(tokensTable.id, tokenId)).returning();

    const { entity: entityType, role } = token;
    // Validate if the token has an entityType and role (must be a membership invite)
    if (!entityType || !role) throw new Error('Token is not a valid membership invite.');

    const entityIdField = entityIdFields[entityType];
    // Validate if the token contains the required entity ID field
    if (!token[entityIdField]) throw new Error(`Token is missing entity ID field for ${entityType}.`);

    const entity = await resolveEntity(entityType, token[entityIdField]);
    // If the entity cannot be found, throw an error
    if (!entity) throw new Error(`Unable to resolve entity (${entityType}) using the token's entity ID.`);

    // Insert membership for user into entity
    await insertMembership({ userId, role, entity, tokenId });
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message;
      logEvent('Error inserting membership from token data', { userId, tokenId, errorMessage }, 'error');
    }

    throw error;
  }
};
