import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';

// Undo the setup.ts mock: the test hands chargeLimiter a real route limiter.
vi.unmock('#/middlewares/rate-limiter/core');

const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
const { chargeLimiter } = await import('#/middlewares/rate-limiter/helpers');

const workLimiter = () =>
  rateLimiter('limit', `scope_${nanoid(8)}`, ['ip'], { limits: { points: 3, duration: 60, blockDuration: 60 } });

/**
 * A limiter charged where the work it bounds starts, from code that has no request context of its own. The charge
 * inside a bound request is proven on its one caller, the authorization server's metadata fetch budget
 * (tests/security/oauth-metadata-fetch-limit.test.ts); no route reaches the unbound case.
 */
describe('limiter scope', () => {
  it('refuses to charge outside a bound request, so the caller can refuse the work', async () => {
    expect(await chargeLimiter(workLimiter())).toBe(false);
  });
});
