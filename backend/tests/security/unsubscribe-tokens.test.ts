import { eq, sql } from 'drizzle-orm';
import { appConfig, hierarchy } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb, getAdminDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { usersTable } from '#/modules/user/user-db';
import { mockUser } from '#/modules/user/user-mocks';
import { hashToken } from '#/utils/hash-token';
import { generateUnsubscribeToken } from '#/utils/unsubscribe-token';
import { sideEffect as unsubscribeTokenHashes } from '../../scripts/migrations/20-unsubscribe-token-hashes.migration';
import { defaultHeaders } from '../fixtures';
import {
  createOrganizationAdminUser,
  createSystemAdminUser,
  createTestOrganization,
  createTestSession,
} from '../helpers';
import { clearSecurityTestData } from './helpers';

vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) } }));

const adminDb = () => getAdminDb('unsubscribe token test');

/** A user created the way sign-up creates one, subscribed to the newsletter. */
const signUp = async (label: string) => {
  const user = await handleCreateUser(
    { var: { db: baseDb } },
    { newUser: mockUser({ email: `${label}@example.test` }) },
  );
  await adminDb().update(usersTable).set({ newsletter: true }).where(eq(usersTable.id, user.id));
  return user;
};

const storedSecrets = async (userId: string) =>
  (await adminDb().select().from(unsubscribeTokensTable).where(eq(unsubscribeTokensTable.userId, userId))).map(
    (row) => row.secret,
  );

const isSubscribed = async (userId: string) => {
  const [user] = await adminDb().select().from(usersTable).where(eq(usersTable.id, userId));
  return user?.newsletter;
};

/** Opens an unsubscribe link the way a mail client does; answers the redirect target. */
const openLink = async (pathAndQuery: string) => {
  const { baseApp } = await import('#/routes');
  const response = await baseApp.request(pathAndQuery, { headers: defaultHeaders });
  return { status: response.status, location: new URL(response.headers.get('location') ?? '', appConfig.frontendUrl) };
};

/**
 * An unsubscribe link carries a bearer token: whoever holds it can change the recipient's settings without signing in.
 * The database keeps only its hash, so a read of the table (a backup, a replica, a log of a failed query) yields
 * nothing that opens the link.
 */
describe('Unsubscribe tokens', () => {
  beforeAll(() => {
    vi.mocked(mailer.prepareEmails).mockClear();
  });

  afterEach(async () => {
    vi.mocked(mailer.prepareEmails).mockClear();
    await clearSecurityTestData();
  });

  it('must not keep an unsubscribe token as its own value in the database', async () => {
    const user = await signUp('stored-token');
    const token = generateUnsubscribeToken(user.email);

    const secrets = await storedSecrets(user.id);
    expect(secrets).toHaveLength(1);
    expect(secrets).not.toContain(token);
  });

  it('must not unsubscribe a user via the value the database holds', async () => {
    const user = await signUp('db-reader');
    const [stored] = await storedSecrets(user.id);

    const { status, location } = await openLink(`/me/unsubscribe?token=${stored}`);

    expect(status).toBe(302);
    expect(location.pathname).toBe('/auth/error');
    expect(location.searchParams.get('error')).toBe('unsubscribe_expired');
    expect(await isSubscribed(user.id)).toBe(true);
  });

  it('unsubscribes with the token from the email (positive control)', async () => {
    const user = await signUp('mail-reader');

    const { status, location } = await openLink(`/me/unsubscribe?token=${generateUnsubscribeToken(user.email)}`);

    expect(status).toBe(302);
    expect(location.pathname).toBe('/auth/unsubscribed');
    expect(await isSubscribed(user.id)).toBe(false);
  });

  describe('rows stored before hashing', () => {
    /** Runs the side-effect block as a migration would, on a database where it has not run yet. */
    const runHashingBlock = async () => {
      const { sql: blockSql } = await unsubscribeTokenHashes.produce();
      await adminDb().execute(sql.raw(blockSql));
    };

    /** A user whose row holds the token itself, as rows written before hashing do. */
    const legacyRow = async (label: string) => {
      const user = await signUp(label);
      const token = generateUnsubscribeToken(user.email);
      await adminDb().delete(unsubscribeTokensTable);
      await adminDb().insert(unsubscribeTokensTable).values({ userId: user.id, secret: token });
      await adminDb().execute(sql`COMMENT ON COLUMN unsubscribe_tokens.secret IS NULL`);
      return { user, token };
    };

    it('must not keep a token stored before hashing as its own value', async () => {
      const { user, token } = await legacyRow('legacy-row');

      await runHashingBlock();

      expect(await storedSecrets(user.id)).toEqual([hashToken(token)]);
      // Positive control: the link sent before the migration still unsubscribes.
      const { location } = await openLink(`/me/unsubscribe?token=${token}`);
      expect(location.pathname).toBe('/auth/unsubscribed');
      expect(await isSubscribed(user.id)).toBe(false);
    });

    it('hashes a stored token once, however often the side effects re-run', async () => {
      const { user, token } = await legacyRow('legacy-rerun');

      await runHashingBlock();
      await runHashingBlock();

      expect(await storedSecrets(user.id)).toEqual([hashToken(token)]);
    });
  });

  it('sends a newsletter whose unsubscribe link unsubscribes its recipient (positive control)', async () => {
    const organization = await createTestOrganization();
    const member = await createOrganizationAdminUser(
      'newsletter-reader@example.test',
      organization.id,
      hierarchy.getLeastPrivilegedRole('organization'),
      true,
      organization.tenantId,
    );
    await adminDb().update(usersTable).set({ newsletter: true }).where(eq(usersTable.id, member.id));
    const admin = await createSystemAdminUser('newsletter-sender@example.test');
    const { baseApp } = await import('#/routes');

    const response = await baseApp.request('/system/newsletter?toSelf=false', {
      method: 'POST',
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
      body: JSON.stringify({
        organizationIds: [organization.id],
        roles: [hierarchy.getLeastPrivilegedRole('organization')],
        subject: 'News',
        content: '<p>News</p>',
      }),
    });
    expect(response.status).toBe(204);

    const [, , [recipient] = []] = vi.mocked(mailer.prepareEmails).mock.calls[0] ?? [];
    expect(recipient?.email).toBe(member.email);
    const link = recipient && 'unsubscribeLink' in recipient ? String(recipient.unsubscribeLink) : '';
    const { status, location } = await openLink(link.replace(appConfig.backendUrl, ''));
    expect(status).toBe(302);
    expect(location.pathname).toBe('/auth/unsubscribed');
    expect(await isSubscribed(member.id)).toBe(false);
  });
});
