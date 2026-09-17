import { eq } from 'drizzle-orm';
import { getMyInvitations, getTokenData } from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';
import { createInvitation } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'], selfRegistration: true });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

describe('Invitation token data', async () => {
  const call = await createAppClient();

  it('binds the invitation to a user created after the invite was sent', async () => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    const { token, inactiveMembership, invitationCookie } = await createInvitation({
      token: 'invoked',
      email: 'late@example.com',
      organization,
      createdBy: inviter.id,
    });

    // The invited person registers through another route; nothing bound the invitation to them.
    const lateUser = await createTestUser('late@example.com');

    const { response, data } = await call(getTokenData, {
      path: { type: 'invitation', id: token.id },
      headers: { ...defaultHeaders, Cookie: invitationCookie },
    });

    expect(response.status).toBe(200);
    expect((data as { userId: string }).userId).toBe(lateUser.id);

    const [bound] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(bound.userId).toBe(lateUser.id);

    // The token survives: this flow's single-use cookie still points at it.
    const [keptToken] = await db.select().from(tokensTable).where(eq(tokensTable.id, token.id));
    expect(keptToken.userId).toBe(lateUser.id);

    const sessionCookie = await createTestSession(lateUser);
    const { data: invitations } = await call(getMyInvitations, {
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
    expect((invitations as { total: number }).total).toBe(1);
  });

  it('leaves the invitation unbound when no user owns the address', async () => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    const { token, inactiveMembership, invitationCookie } = await createInvitation({
      token: 'invoked',
      email: 'nobody@example.com',
      organization,
      createdBy: inviter.id,
    });

    const { response, data } = await call(getTokenData, {
      path: { type: 'invitation', id: token.id },
      headers: { ...defaultHeaders, Cookie: invitationCookie },
    });

    expect(response.status).toBe(200);
    expect((data as { userId: string }).userId).toBe('');

    const [unbound] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(unbound.userId).toBeNull();
  });
});
