import { Hono } from 'hono';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import type { Env } from '#/core/context';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { type TokenPolicy, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import { setCookieOf } from '../../../../tests/helpers';

const linkKinds = appConfig.tokenKinds.filter((kind) => tokenPolicies[kind].carrier === 'link');

// A policy for every token kind, a handler for every link kind and a known replacement rule are checked by the types.
describe('token policies', () => {
  it('gives every link a single-use window shorter than its lifetime', () => {
    for (const kind of linkKinds) {
      const policy = tokenPolicies[kind];
      if (policy.carrier !== 'link') throw new Error(`${kind} is not a link token`);
      expect(policy.singleUseWindow.milliseconds(), kind).toBeLessThan(policy.ttl.milliseconds());
    }
  });

  it('keeps an opened invitation usable through a magic-link sign-in to another account', () => {
    expect(tokenPolicies.invitation.singleUseWindow.milliseconds()).toBeGreaterThan(tokenPolicies.magic.ttl.milliseconds());
  });

  it("sets each token kind's cookie with its policy's SameSite", async () => {
    const app = new Hono<Env>().get('/:kind', (ctx) => {
      const kind = appConfig.tokenKinds.find((name) => name === ctx.req.param('kind'));
      if (!kind) return ctx.body(null, 404);
      setAuthCookie(ctx, kind, 'value', tokenPolicies[kind].ttl);
      return ctx.body(null, 204);
    });

    for (const kind of appConfig.tokenKinds) {
      const policy: TokenPolicy = tokenPolicies[kind];
      // A code travels in a mail only: no cookie carries it.
      if (policy.carrier === 'code') continue;
      const response = await app.request(`/${kind}`);
      const expected = policy.sameSite === 'lax' ? 'SameSite=Lax' : 'SameSite=Strict';
      expect(setCookieOf(response, kind).line, kind).toContain(expected);
    }
  });
});
