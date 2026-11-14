import { nanoid } from 'nanoid';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { HeldLinkKind } from '#/modules/auth/tokens/token-policies';
import { cookieChange, createTestOrganization, createTestUser, insertTestToken, linkIdentity, openHeldLink, tokenRow } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['magic', 'oauth'], enabledOAuthProviders: ['github'] });

afterEach(async () => await clearSecurityTestData());

/** A link-rewriting mail gateway fetches every link in a mail first, with a desktop browser's User-Agent. */
const scannerHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'x-forwarded-for': '203.0.113.7',
};

/**
 * A mail scanner or a link preview fetches an invitation or address verification link before its owner does. A GET,
 * and a HEAD that runs the GET handler, only hold the link for the app's confirm page, whose POST redeems it, so the
 * owner who opens the link afterwards still can.
 */
describe('invitation and verification links fetched by a scanner', () => {
  const address = (label: string) => `${label}-${nanoid(6)}@security-test.com`.toLowerCase();

  /** A scanner's HEAD and GET of the link: each answers with the confirm page and redeems nothing. */
  const scan = async (type: HeldLinkKind, rawToken: string) => {
    const { baseApp } = await import('#/routes');
    for (const method of ['HEAD', 'GET']) {
      const response = await baseApp.request(`/auth/invoke-token/${type}/${rawToken}`, { method, headers: scannerHeaders });
      expect(response.status, method).toBe(302);
      expect(response.headers.get('location'), method).toBe(new URL(`/auth/confirm-link/${type}`, appConfig.frontendUrl).toString());
      expect(cookieChange(response, type), method).toBeUndefined();
    }
  };

  it('must not let a scanner use up an invitation link', async () => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser(address('inviter'));
    const { rawToken, token } = await createInvitation({ organization, email: address('invitee'), createdBy: inviter.id });

    await scan('invitation', rawToken);
    expect((await tokenRow(token.id)).redeemedAt).toBeNull();

    // Positive control: the invitee opens the link and confirms it on the page it leads to.
    const opened = await openHeldLink('invitation', rawToken);
    expect(opened.response.status).toBe(200);
    expect(opened.redirectUrl).toBe(`${appConfig.frontendUrl}/auth/authenticate?tokenId=${token.id}`);
    expect(cookieChange(opened.response, 'invitation')).toBe('set');
  });

  it('must not let a scanner use up an address verification link', async () => {
    const user = await createTestUser(address('connecting'));
    const identity = await linkIdentity(user, { verifiedAt: null });
    const { raw, row } = await insertTestToken('oauth-verification', user, { identityId: identity.id, expiresInMs: 2 * 60 * 60 * 1000 });

    await scan('oauth-verification', raw);
    expect((await tokenRow(row.id)).redeemedAt).toBeNull();

    // Positive control: the owner's confirmation redeems the link and goes on to the provider.
    const opened = await openHeldLink('oauth-verification', raw);
    expect(opened.response.status).toBe(200);
    expect(new URL(opened.redirectUrl ?? '').pathname).toBe(new URL(`${appConfig.backendAuthUrl}/github`).pathname);
    expect(cookieChange(opened.response, 'oauth-verification')).toBe('set');
  });
});
