import { and, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { AppError } from '#/lib/error';

/**
 * Retrieve a user's GitHub access token from their OAuth account.
 * @param userId - The internal user ID.
 * @returns The GitHub access token.
 * @throws AppError if no GitHub account is connected or no token is available.
 */
export async function getGitHubAccessToken(userId: string): Promise<string> {
  const [oauthAccount] = await db
    .select({ accessToken: oauthAccountsTable.accessToken })
    .from(oauthAccountsTable)
    .where(and(eq(oauthAccountsTable.userId, userId), eq(oauthAccountsTable.provider, 'github')));

  if (!oauthAccount) {
    throw new AppError(400, 'forbidden', 'warn', {
      message: 'GitHub account not connected. Please sign in with GitHub first.',
    });
  }

  if (!oauthAccount.accessToken) {
    throw new AppError(400, 'forbidden', 'warn', {
      message: 'GitHub access token not available. Please reconnect your GitHub account.',
    });
  }

  return oauthAccount.accessToken;
}

/**
 * Get a GitHub access token for any member of an organization.
 * Used by background workers that need to access GitHub on behalf of the organization.
 * @param organizationId - The organization ID.
 * @returns The GitHub access token.
 * @throws AppError if no organization member has a valid GitHub connection.
 */
export async function getGitHubAccessTokenForOrganization(organizationId: string): Promise<string> {
  // Find an organization member with a valid GitHub token
  const result = await db
    .select({ accessToken: oauthAccountsTable.accessToken })
    .from(membershipsTable)
    .innerJoin(oauthAccountsTable, eq(oauthAccountsTable.userId, membershipsTable.userId))
    .where(and(eq(membershipsTable.organizationId, organizationId), eq(oauthAccountsTable.provider, 'github')))
    .limit(1);

  const oauthAccount = result[0];

  if (!oauthAccount?.accessToken) {
    throw new AppError(400, 'forbidden', 'warn', {
      message: 'No organization member has a valid GitHub connection. A member must sign in with GitHub first.',
    });
  }

  return oauthAccount.accessToken;
}

/**
 * Check if a user has a connected GitHub account with a valid access token.
 * @param userId - The internal user ID.
 * @returns True if the user has a valid GitHub connection.
 */
export async function hasGitHubConnection(userId: string): Promise<boolean> {
  const [oauthAccount] = await db
    .select({ accessToken: oauthAccountsTable.accessToken })
    .from(oauthAccountsTable)
    .where(and(eq(oauthAccountsTable.userId, userId), eq(oauthAccountsTable.provider, 'github')));

  return !!oauthAccount?.accessToken;
}
