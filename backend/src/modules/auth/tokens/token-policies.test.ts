import { Hono } from 'hono';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import type { Env } from '#/core/context';
import { authCookieName, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { tokenPolicies } from '#/modules/auth/tokens/token-policies';

const linkTypes = appConfig.tokenTypes.filter((type) => tokenPolicies[type].carrier === 'link');

// A policy for every token type, a handler for every link type and a known replacement rule are checked by the types.
describe('token policies', () => {
  it('gives every link a single-use window shorter than its lifetime', () => {
    for (const type of linkTypes) {
      const policy = tokenPolicies[type];
      if (policy.carrier !== 'link') throw new Error(`${type} is not a link token`);
      expect(policy.singleUseWindow.milliseconds(), type).toBeLessThan(policy.ttl.milliseconds());
    }
  });

  it('keeps an opened invitation usable through a magic-link sign-in to another account', () => {
    expect(tokenPolicies.invitation.singleUseWindow.milliseconds()).toBeGreaterThan(
      tokenPolicies.magic.ttl.milliseconds(),
    );
  });

  it("sets each token type's cookie with its policy's SameSite", async () => {
    const app = new Hono<Env>().get('/:type', async (ctx) => {
      const type = appConfig.tokenTypes.find((name) => name === ctx.req.param('type'));
      if (!type) return ctx.body(null, 404);
      await setAuthCookie(ctx, type, 'value', tokenPolicies[type].ttl);
      return ctx.body(null, 204);
    });

    for (const type of appConfig.tokenTypes) {
      const response = await app.request(`/${type}`);
      const cookie = response.headers.getSetCookie().find((line) => line.startsWith(`${authCookieName(type)}=`));
      const expected = tokenPolicies[type].sameSite === 'lax' ? 'SameSite=Lax' : 'SameSite=Strict';
      expect(cookie, type).toContain(expected);
    }
  });
});
