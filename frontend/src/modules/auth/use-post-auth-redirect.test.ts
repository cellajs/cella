import { appConfig } from 'shared';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });

const { resolvePostAuthRedirect, invitationResumePath } = await import('~/modules/auth/use-post-auth-redirect');
const { authenticateRouteSearchParamsSchema } = await import('~/modules/auth/search-params-schemas');

describe('resolvePostAuthRedirect', () => {
  it('follows a same-origin deep link with its query and hash (positive control)', () => {
    expect(resolvePostAuthRedirect('/acme/organization/members?q=a%26b#row')).toBe(
      '/acme/organization/members?q=a%26b#row',
    );
  });

  it('prefers the invitation resume path when a token is in hand', () => {
    expect(resolvePostAuthRedirect('/home', 'tok-1')).toBe(invitationResumePath('tok-1'));
  });

  it('must not leave the app via dot segments that collapse to a scheme-relative URL', () => {
    for (const redirect of ['/..//evil.example', '/.//evil.example', '/%2e%2e//evil.example']) {
      expect(resolvePostAuthRedirect(redirect)).toBe(appConfig.defaultRedirectPath);
    }
  });

  it('must not leave the app via backslashes, encoded slashes or absolute URLs', () => {
    for (const redirect of ['/\\evil.example', '/./\\evil.example', '/%2Fevil.example', 'https://evil.example']) {
      expect(resolvePostAuthRedirect(redirect)).toBe(appConfig.defaultRedirectPath);
    }
  });

  it('must not send the browser into backend routes', () => {
    expect(resolvePostAuthRedirect('/api/auth/sign-out')).toBe(appConfig.defaultRedirectPath);
  });

  it('falls back to the default path without a redirect', () => {
    expect(resolvePostAuthRedirect(undefined)).toBe(appConfig.defaultRedirectPath);
  });
});

describe('authenticate search params', () => {
  it('drops an unsafe redirect and keeps a safe one', () => {
    expect(authenticateRouteSearchParamsSchema.parse({ redirect: '/..//evil.example' }).redirect).toBeUndefined();
    expect(authenticateRouteSearchParamsSchema.parse({ redirect: '/home?tab=a' }).redirect).toBe('/home?tab=a');
    expect(authenticateRouteSearchParamsSchema.parse({}).redirect).toBeUndefined();
  });
});
