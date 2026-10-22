import { appConfig } from 'shared';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });

const { resolvePostAuthRedirect } = await import('~/modules/auth/use-post-auth-redirect');
const { authenticateRouteSearchParamsSchema } = await import('~/modules/auth/search-params-schemas');

describe('resolvePostAuthRedirect', () => {
  it('follows a same-origin deep link with its query and hash (positive control)', () => {
    expect(resolvePostAuthRedirect('/acme/organization/members?q=a%26b#row')).toBe('/acme/organization/members?q=a%26b#row');
  });

  it('must not send the browser off the app or into a backend route after sign-in', () => {
    const redirects = [
      '/..//evil.example',
      '/.//evil.example',
      '/%2e%2e//evil.example',
      '/\\evil.example',
      '/./\\evil.example',
      '/%2Fevil.example',
      'https://evil.example',
      '/api/auth/sign-out',
    ];
    for (const redirect of redirects) expect(resolvePostAuthRedirect(redirect)).toBe(appConfig.defaultRedirectPath);
  });
});

describe('authenticate search params', () => {
  it('drops an unsafe redirect and keeps a safe one', () => {
    expect(authenticateRouteSearchParamsSchema.parse({ redirect: '/..//evil.example' }).redirect).toBeUndefined();
    expect(authenticateRouteSearchParamsSchema.parse({ redirect: '/home?tab=a' }).redirect).toBe('/home?tab=a');
    expect(authenticateRouteSearchParamsSchema.parse({}).redirect).toBeUndefined();
  });
});
