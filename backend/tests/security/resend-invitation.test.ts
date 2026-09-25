import { and, eq } from 'drizzle-orm';
import { invokeToken, resendInvitationWithToken, resendPendingInvitation } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { hashToken } from '#/utils/hash-token';
import { getIsoDate } from '#/utils/iso-date';
import { memberInviteWithTokenEmail, systemInviteEmail } from '../../emails';
import { defaultHeaders } from '../fixtures';
import {
  createOrganizationAdminUser,
  createTestOrganization,
  createTestSession,
  createTestUser,
  type ErrorResponse,
} from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

vi.mock('#/lib/mailer', () => ({
  mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) },
}));

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const invitedEmail = 'invitee@example.com';

beforeAll(() => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearSecurityTestData();
  vi.clearAllMocks();
});

/** Every invitation token row addressed to `email`, whatever invitation it belongs to. */
const invitationTokensOf = (email: string) =>
  db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.type, 'invitation'), eq(tokensTable.email, email)));

/** The raw token at the end of the invite link in the mail handed to the mailer. */
const mailedRawToken = () => {
  const [, , recipients] = vi.mocked(mailer.prepareEmails).mock.calls[0];
  const [recipient] = recipients;
  const inviteLink = 'inviteLink' in recipient && typeof recipient.inviteLink === 'string' ? recipient.inviteLink : '';
  expect(inviteLink.startsWith(`${appConfig.backendAuthUrl}/invoke-token/invitation/`)).toBe(true);
  return inviteLink.split('/').at(-1) ?? '';
};

/** A system invitation (no membership row) for an address nobody has an account on, its week long since over. */
const createSystemInvitation = async (email: string, createdBy: string) => {
  const rawToken = nanoid(40);
  const [token] = await db
    .insert(tokensTable)
    .values({
      secret: hashToken(rawToken),
      type: 'invitation',
      email,
      createdBy,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    .returning();
  return { token, rawToken };
};

describe('Resend an invitation', async () => {
  const call = await createAppClient();

  /** A membership invitation whose emailed link expired, the state in which the invitee asks for a new one. */
  const expiredInvitation = async () => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    const invitation = await createInvitation({ organization, email: invitedEmail, createdBy: inviter.id });
    const [token] = await db
      .update(tokensTable)
      .set({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(tokensTable.id, invitation.token.id))
      .returning();
    return { organization, inviter, ...invitation, token };
  };

  const resend = (body: { tokenId: string }) => call(resendInvitationWithToken, { body, headers: defaultHeaders });

  const invoke = (token: string) => call(invokeToken, { path: { type: 'invitation', token }, headers: defaultHeaders });

  it('re-sends a pending invitation with one fresh link that works, and retires the old link', async () => {
    const { token, rawToken, inactiveMembership } = await expiredInvitation();

    const { response } = await resend({ tokenId: token.id });
    expect(response.status).toBe(204);

    expect(mailer.prepareEmails).toHaveBeenCalledTimes(1);
    const [template, , recipients] = vi.mocked(mailer.prepareEmails).mock.calls[0];
    expect(template).toBe(memberInviteWithTokenEmail);
    expect(recipients).toEqual([expect.objectContaining({ email: invitedEmail })]);

    // One live token under a new id, pointed at by its invitation, holding the mailed link's hash.
    const tokens = await invitationTokensOf(invitedEmail);
    expect(tokens).toHaveLength(1);
    const [fresh] = tokens;
    expect(fresh.id).not.toBe(token.id);
    expect(fresh).toMatchObject({ inactiveMembershipId: inactiveMembership.id, invokedAt: null, singleUseToken: null });
    expect(new Date(fresh.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const rawFresh = mailedRawToken();
    expect(fresh.secret).toBe(hashToken(rawFresh));
    const [pointed] = await db
      .select({ tokenId: inactiveMembershipsTable.tokenId })
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(pointed.tokenId).toBe(fresh.id);

    const opened = await invoke(rawFresh);
    expect(opened.response.status).toBe(302);
    expect(opened.response.headers.get('location')).toBe(
      `${appConfig.frontendUrl}/auth/authenticate?tokenId=${fresh.id}`,
    );

    const old = await invoke(rawToken);
    expect(old.response.status).toBe(401);
    expect((old.error as ErrorResponse).type).toBe('invitation_not_found');
  });

  it('names an expired invitation on the error page by its token id, so the page can ask for a new link', async () => {
    const { token, rawToken } = await expiredInvitation();

    // Outside test mode the refusal is the redirect a browser opening the link sees.
    const { mode } = appConfig;
    const setMode = (value: string) => {
      Object.assign(appConfig, { mode: value });
    };
    setMode('development');
    onTestFinished(() => setMode(mode));

    const opened = await invoke(rawToken);
    setMode(mode);
    expect(opened.response.status).toBe(302);
    const errorPage = new URL(opened.response.headers.get('location') ?? '');
    expect(`${errorPage.origin}${errorPage.pathname}`).toBe(`${appConfig.frontendUrl}/auth/error`);
    expect(errorPage.searchParams.get('error')).toBe('invitation_expired');
    expect(errorPage.searchParams.get('tokenId')).toBe(token.id);
    expect(errorPage.toString()).not.toContain(rawToken);

    // The page's resend button sends that id.
    const { response } = await resend({ tokenId: errorPage.searchParams.get('tokenId') ?? '' });
    expect(response.status).toBe(204);
    expect(mailer.prepareEmails).toHaveBeenCalledTimes(1);
  });

  it('re-sends a pending system invitation with one fresh link', async () => {
    const inviter = await createTestUser('inviter@example.com');
    const { token } = await createSystemInvitation('newcomer@example.com', inviter.id);

    const { response } = await resend({ tokenId: token.id });
    expect(response.status).toBe(204);

    expect(mailer.prepareEmails).toHaveBeenCalledTimes(1);
    const [template, , recipients] = vi.mocked(mailer.prepareEmails).mock.calls[0];
    expect(template).toBe(systemInviteEmail);
    expect(recipients).toEqual([expect.objectContaining({ email: 'newcomer@example.com' })]);

    const tokens = await invitationTokensOf('newcomer@example.com');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].id).not.toBe(token.id);
    expect(tokens[0]).toMatchObject({ inactiveMembershipId: null, invokedAt: null });
    expect(tokens[0].secret).toBe(hashToken(mailedRawToken()));
  });

  it('must not re-mint a rejected invitation via resend-invitation', async () => {
    const { token, inactiveMembership } = await expiredInvitation();
    await db
      .update(inactiveMembershipsTable)
      .set({ rejectedAt: getIsoDate() })
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

    const { response } = await resend({ tokenId: token.id });

    expect(response.status).toBe(204);
    expect(mailer.prepareEmails).not.toHaveBeenCalled();
    expect(await invitationTokensOf(invitedEmail)).toEqual([token]);
  });

  it('must not re-mint a revoked invitation via resend-invitation', async () => {
    const { token, inactiveMembership } = await expiredInvitation();
    // The invitation row is gone (its channel was deleted); the token row outlives it, since tokens have no foreign key to it.
    await db.delete(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

    const { response } = await resend({ tokenId: token.id });

    expect(response.status).toBe(204);
    expect(mailer.prepareEmails).not.toHaveBeenCalled();
    expect(await invitationTokensOf(invitedEmail)).toEqual([token]);
  });

  it('must not re-mint an accepted invitation via resend-invitation', async () => {
    const { token, inactiveMembership } = await expiredInvitation();
    // Accepting deletes the invitation row and its tokens.
    await db.delete(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    const { response } = await resend({ tokenId: token.id });

    expect(response.status).toBe(204);
    expect(mailer.prepareEmails).not.toHaveBeenCalled();
    expect(await invitationTokensOf(invitedEmail)).toHaveLength(0);
  });

  it('must not re-mint a used system invitation via resend-invitation', async () => {
    const inviter = await createTestUser('inviter@example.com');
    const { token } = await createSystemInvitation('newcomer@example.com', inviter.id);
    // The invitee signed up and proved the address: the invitation did its job.
    await createTestUser('newcomer@example.com');

    const { response } = await resend({ tokenId: token.id });

    expect(response.status).toBe(204);
    expect(mailer.prepareEmails).not.toHaveBeenCalled();
    expect(await invitationTokensOf('newcomer@example.com')).toEqual([token]);
  });

  it('must not reveal whether an address was invited via resend-invitation', async () => {
    const { token } = await expiredInvitation();
    const { baseApp } = await import('#/routes');
    const resendByEmail = (email: string) =>
      baseApp.request('/auth/resend-invitation', {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({ email }),
      });

    // An address is no key: the invited and the unknown one get the same refusal.
    const invited = await resendByEmail(invitedEmail);
    const unknown = await resendByEmail('stranger@example.com');
    expect(invited.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(((await invited.json()) as ErrorResponse).type).toBe('form.invalid_type');
    expect(((await unknown.json()) as ErrorResponse).type).toBe('form.invalid_type');

    // An id that names no invitation answers like one that does.
    const { response } = await resend({ tokenId: generateId() });
    expect(response.status).toBe(204);

    expect(mailer.prepareEmails).not.toHaveBeenCalled();
    expect(await invitationTokensOf(invitedEmail)).toEqual([token]);
  });
});

describe('Resend a pending invitation from the pending list', async () => {
  const call = await createAppClient();

  const setup = async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser(
      'org-admin@example.com',
      organization.id,
      'admin',
      true,
      organization.tenantId,
    );
    const invitation = await createInvitation({ organization, email: invitedEmail, createdBy: admin.id });
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };
    const path = {
      tenantId: organization.tenantId,
      organizationId: organization.id,
      id: invitation.inactiveMembership.id,
    };
    return { organization, headers, path, ...invitation };
  };

  it('re-sends the invitation with one fresh link', async () => {
    const { headers, path, token } = await setup();

    const { response } = await call(resendPendingInvitation, { path, headers });

    expect(response.status).toBe(204);
    expect(mailer.prepareEmails).toHaveBeenCalledTimes(1);
    const tokens = await invitationTokensOf(invitedEmail);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].id).not.toBe(token.id);
    expect(tokens[0].secret).toBe(hashToken(mailedRawToken()));
  });

  it('must not re-mint a rejected invitation via the pending list', async () => {
    const { headers, path, token, inactiveMembership } = await setup();
    await db
      .update(inactiveMembershipsTable)
      .set({ rejectedAt: getIsoDate() })
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

    const { response, error } = await call(resendPendingInvitation, { path, headers });

    expect(response.status).toBe(404);
    expect((error as ErrorResponse).type).toBe('token_not_found');
    expect(mailer.prepareEmails).not.toHaveBeenCalled();
    expect(await invitationTokensOf(invitedEmail)).toEqual([token]);
  });
});
